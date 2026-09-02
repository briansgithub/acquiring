# frozen_string_literal: true

require "json"
require "digest"
require "open3"
require "fileutils"
require "net/http"
require "uri"
require "rexml/document"

module BetaRelease
  class Stop < StandardError; end
  PACKAGE = "com.acquiring.android"
  ROOT = File.expand_path("../..", __dir__)
  SETTINGS = File.expand_path("../release-settings.json", __dir__)
  LIMIT = 2_100_000_000

  def self.settings
    JSON.parse(File.read(SETTINGS))
  end

  def self.tracks!(config)
    tracks = config.values_at("internal_track", "closed_track")
    unless config["package_name"] == PACKAGE && config["tracks_verified_from_api"] == true &&
           tracks.all? { |t| t.is_a?(String) && t.match?(/\A[a-zA-Z0-9_-]+\z/) } &&
           tracks.uniq.size == 2 && tracks.none? { |t| %w[production beta].include?(t.downcase) }
      raise Stop, "Testing track IDs must be discovered through the API and pinned before release"
    end
    tracks
  end

  def self.check_notes!(notes)
    raise Stop, "English release notes must contain 1–500 characters" unless notes.is_a?(String) && notes.strip.size.between?(1, 500) && notes.size <= 500
  end

  def self.repo_version
    source = File.read(File.join(ROOT, "app/build.gradle"))
    code = source.match(/^\s*versionCode\s+(\d+)\s*$/)&.captures&.first
    name = source.match(/^\s*versionName\s+"([^"]+)"\s*$/)&.captures&.first
    raise Stop, "Expected literal repository versionCode and versionName" unless code && name
    [Integer(code), name]
  end

  def self.codes(snapshot)
    bundle_codes = snapshot.fetch("bundles", []).map { |b| Integer(b.fetch("versionCode")) }
    apk_codes = snapshot.fetch("apks", []).map { |a| Integer(a.fetch("versionCode")) }
    track_codes = snapshot.fetch("tracks").flat_map { |t| t.fetch("releases", []).flat_map { |r| r.fetch("versionCodes", []).map { |v| Integer(v) } } }
    bundle_codes + apk_codes + track_codes
  end

  def self.next_code(repository_code, snapshot)
    value = ([repository_code] + codes(snapshot)).max + 1
    raise Stop, "Android versionCode limit exceeded" if value > LIMIT
    value
  end

  def self.track!(snapshot, id)
    snapshot.fetch("tracks").find { |track| track["track"] == id } || raise(Stop, "Pinned testing track not found in Play")
  end

  def self.matches?(snapshot, id, plan)
    track!(snapshot, id).fetch("releases", []).any? do |r|
      r["name"] == plan["release_name"] && r["status"] == "completed" &&
        r.fetch("versionCodes", []).map(&:to_i) == [plan.fetch("version_code")]
    end
  end

  def self.target_safe!(snapshot, id, version)
    releases = track!(snapshot, id).fetch("releases", [])
    raise Stop, "Track has an unfinished release; inspect Play Console first" if releases.any? { |r| r["status"] != "completed" }
    existing = releases.flat_map { |r| r.fetch("versionCodes", []).map(&:to_i) }
    raise Stop, "Refusing a duplicate version or track downgrade" if existing.any? { |v| v >= version }
  end

  # Only these adapter methods can mutate Play. There are deliberately no APIs for
  # production, tester lists, country availability, metadata or policy declarations.
  class Play
    def initialize
      require "google/apis/androidpublisher_v3"
      require "googleauth"
      @api = Google::Apis::AndroidpublisherV3
      @service = @api::AndroidPublisherService.new
      @service.authorization = Google::Auth.get_application_default(["https://www.googleapis.com/auth/androidpublisher"])
      @service.client_options.application_name = "Acquiring Android beta"
      @service.client_options.open_timeout_sec = 60
      @service.client_options.read_timeout_sec = 300
      @service.client_options.send_timeout_sec = 300
      # Never blindly retry uploads, track changes, or edit commits.
      @service.request_options.retries = 0
    end

    def json(object)
      JSON.parse(object.to_json)
    end

    def begin_edit
      @service.insert_edit(PACKAGE, @api::AppEdit.new).id
    end

    def snapshot(edit = nil)
      own_edit = edit.nil?
      edit ||= begin_edit
      {
        "tracks" => json(@service.list_edit_tracks(PACKAGE, edit)).fetch("tracks", []),
        "bundles" => json(@service.list_edit_bundles(PACKAGE, edit)).fetch("bundles", []),
        "apks" => json(@service.list_edit_apks(PACKAGE, edit)).fetch("apks", [])
      }
    ensure
      discard(edit) if own_edit && edit
    end

    def discard(edit)
      @service.delete_edit(PACKAGE, edit)
    rescue StandardError
      # A committed, expired or invalidated edit may already be gone.
      nil
    end

    def upload(edit, path)
      json(@service.upload_edit_bundle(PACKAGE, edit, upload_source: path, content_type: "application/octet-stream"))
    end

    def set_release(edit, id, plan, allowed)
      raise Stop, "Unsupported destination track" unless allowed.include?(id) && id.downcase != "production"
      release = @api::TrackRelease.new(
        name: plan.fetch("release_name"), status: "completed",
        version_codes: [plan.fetch("version_code").to_s],
        release_notes: [@api::LocalizedText.new(language: "en-US", text: plan.fetch("notes"))]
      )
      @service.update_edit_track(PACKAGE, edit, id, @api::Track.new(track: id, releases: [release]))
    end

    def validate(edit)
      @service.validate_edit(PACKAGE, edit)
    end

    def commit(edit)
      @service.commit_edit(PACKAGE, edit, changes_not_sent_for_review: false)
    end
  end

  class Publisher
    attr_reader :outcomes

    def initialize(play, config, plan)
      @play, @config, @plan = play, config, plan
      @tracks = BetaRelease.tracks!(config)
      @outcomes = { "internal" => "not submitted", "closed" => "not submitted" }
      BetaRelease.check_notes!(plan["notes"])
    end

    def verified_bundle?(snapshot)
      snapshot.fetch("bundles", []).any? do |b|
        b["versionCode"].to_i == @plan["version_code"] && b["sha256"].to_s.downcase == @plan["sha256"]
      end
    end

    def upload_once(edit, path)
      begin
        result = @play.upload(edit, path)
        unless result["versionCode"].to_i == @plan["version_code"] && result["sha256"].to_s.downcase == @plan["sha256"]
          raise Stop, "Uploaded bundle identity did not match the verified AAB"
        end
      rescue Stop
        raise
      rescue StandardError
        # Inspect the same edit after a lost response; continue only on exact hash.
        raise Stop, "Upload outcome uncertain; no retry performed. Inspect Play before retrying" unless verified_bundle?(@play.snapshot(edit))
      end
    end

    def commit_once(edit, track, label)
      @outcomes[label] = "commit attempted; verification required"
      begin
        @play.commit(edit)
      rescue StandardError
        snapshot = @play.snapshot
        unless BetaRelease.matches?(snapshot, track, @plan) && verified_bundle?(snapshot)
          @outcomes[label] = "manual action required: commit failed or uncertain"
          raise Stop, "Commit failed or uncertain; state inspected, no automatic retry or draft fallback"
        end
      end
      snapshot = @play.snapshot
      unless BetaRelease.matches?(snapshot, track, @plan) && verified_bundle?(snapshot)
        @outcomes[label] = "manual action required: committed version not verified"
        raise Stop, "Play did not expose the expected version after submission"
      end
      @outcomes[label] = "API accepted and version verified; review/availability not confirmed"
    end

    def run(path, mode)
      raise Stop, "Unsupported release mode" unless %w[validate publish].include?(mode)
      snapshot = @play.snapshot
      raise Stop, "Version already exists; inspect Play before a retry" if BetaRelease.codes(snapshot).include?(@plan.fetch("version_code"))
      @tracks.each { |t| BetaRelease.target_safe!(snapshot, t, @plan.fetch("version_code")) }

      edit = @play.begin_edit
      # Recheck within the actual edit to catch a concurrent Console change.
      current = @play.snapshot(edit)
      raise Stop, "Version raced with another upload" if BetaRelease.codes(current).include?(@plan.fetch("version_code"))
      @tracks.each { |t| BetaRelease.target_safe!(current, t, @plan.fetch("version_code")) }
      upload_once(edit, path)
      @play.set_release(edit, @tracks[0], @plan, @tracks)
      if mode == "validate"
        @play.set_release(edit, @tracks[1], @plan, @tracks)
        @play.validate(edit)
        @outcomes.transform_values! { "validated only; edit discarded, no release published" }
        return @outcomes
      end
      @play.validate(edit)
      commit_once(edit, @tracks[0], "internal")
      @play.discard(edit)
      edit = nil

      # Promotion references this one version; never "latest", never upload again.
      edit = @play.begin_edit
      snapshot = @play.snapshot(edit)
      unless BetaRelease.matches?(snapshot, @tracks[0], @plan) && verified_bundle?(snapshot)
        raise Stop, "Internal changed before promotion; manual reconciliation required"
      end
      BetaRelease.target_safe!(snapshot, @tracks[1], @plan.fetch("version_code"))
      @play.set_release(edit, @tracks[1], @plan, @tracks)
      @play.validate(edit)
      commit_once(edit, @tracks[1], "closed")
      snapshot = @play.snapshot
      @tracks.each_with_index do |track, index|
        unless BetaRelease.matches?(snapshot, track, @plan)
          @outcomes[index.zero? ? "internal" : "closed"] = "manual action required: track no longer references intended version"
          raise Stop, "Both testing tracks must retain the intended version"
        end
      end
      @outcomes
    rescue Stop
      raise
    rescue StandardError => error
      # The SDK can include request details in exceptions. Log only its class.
      raise Stop, "Play operation failed (#{error.class}); no retry or draft fallback. Inspect both tracks"
    ensure
      @play.discard(edit) if edit
    end
  end

  def self.state_path
    File.join(ENV.fetch("RUNNER_TEMP"), "android-beta-state.json")
  end

  def self.save(plan)
    File.write(state_path, JSON.pretty_generate(plan), mode: "w", perm: 0o600)
  end

  def self.prepare
    config = settings
    targets = tracks!(config)
    check_notes!(ENV["RELEASE_NOTES"])
    sha = ENV.fetch("RELEASE_SHA")
    raise Stop, "Expected a full commit SHA" unless sha.match?(/\A[0-9a-f]{40}\z/)
    snapshot = Play.new.snapshot
    targets.each { |id| track!(snapshot, id) }
    marker = "beta-#{sha}"
    existing = snapshot.fetch("tracks").flat_map { |t| t.fetch("releases", []) }.select { |r| r["name"] == marker }
    raise Stop, "This commit already has a beta submission. Inspect both tracks instead of rebuilding/retrying" unless existing.empty?
    code, name = repo_version
    value = next_code(code, snapshot)
    targets.each { |id| target_safe!(snapshot, id, value) }
    save({ "commit" => sha, "version_code" => value, "version_name" => name,
           "release_name" => marker, "notes" => ENV.fetch("RELEASE_NOTES"), "mode" => ENV.fetch("RELEASE_MODE"),
           "internal_track" => targets[0], "closed_track" => targets[1] })
  rescue Stop
    raise
  rescue StandardError => error
    raise Stop, "Play preflight failed (#{error.class}); no release submitted"
  end

  def self.command!(*command)
    output, status = Open3.capture2e(*command, chdir: ROOT)
    raise Stop, "Command failed: #{File.basename(command.first)} (exit #{status.exitstatus}); credentials and build logs withheld" unless status.success?
    output
  end

  def self.download!(url, destination, expected)
    uri = URI(url)
    6.times do
      raise Stop, "Insecure tool download URL" unless uri.scheme == "https"
      response = Net::HTTP.get_response(uri)
      if response.is_a?(Net::HTTPRedirection)
        uri = URI.join(uri, response.fetch("location"))
        next
      end
      raise Stop, "Bundletool download failed" unless response.is_a?(Net::HTTPSuccess)
      raise Stop, "Bundletool checksum mismatch" unless Digest::SHA256.hexdigest(response.body) == expected
      File.binwrite(destination, response.body)
      return
    end
    raise Stop, "Too many bundletool redirects"
  end

  def self.build
    plan = JSON.parse(File.read(state_path))
    config = settings
    command!(File.join(ROOT, "gradlew"), "--no-daemon", "--no-configuration-cache", "--no-build-cache",
             "-PACQUIRING_RELEASE_VERSION_CODE=#{plan.fetch('version_code')}", "clean", "bundleRelease")
    path = File.join(ROOT, "app/build/outputs/bundle/release/app-release.aab")
    raise Stop, "Expected one release bundle" unless File.file?(path)
    tool = File.join(ENV.fetch("RUNNER_TEMP"), "bundletool.jar")
    version = config.fetch("bundletool_version")
    download!("https://github.com/google/bundletool/releases/download/#{version}/bundletool-all-#{version}.jar", tool, config.fetch("bundletool_sha256"))
    command!("java", "-jar", tool, "validate", "--bundle=#{path}")
    manifest = command!("java", "-jar", tool, "dump", "manifest", "--bundle=#{path}", "--module=base")
    check_manifest!(manifest, plan)
    verify, status = Open3.capture2e("jarsigner", "-J-Duser.language=en", "-verify", "-strict", path)
    certificate = command!("keytool", "-J-Duser.language=en", "-printcert", "-jarfile", path)
    check_signature!(verify, status.exitstatus, certificate, config.fetch("upload_sha1"))
    plan["sha256"] = Digest::SHA256.file(path).hexdigest
    plan["bundle_path"] = path
    save(plan)
  end

  def self.check_manifest!(manifest, plan)
    xml = REXML::Document.new(manifest)
    root = xml.root
    sdk = root.elements["uses-sdk"]
    unless root.attributes["package"] == PACKAGE && root.attributes["android:versionCode"].to_i == plan["version_code"] &&
           root.attributes["android:versionName"] == plan["version_name"] && sdk.attributes["android:targetSdkVersion"] == "36" &&
           sdk.attributes["android:minSdkVersion"] == "26" && root.elements["application"].attributes["android:debuggable"] != "true"
      raise Stop, "Bundle package, version, SDK or debuggability did not match the release plan"
    end
  end

  def self.check_signature!(verify, exit_code, certificate, expected_sha1)
    # Expected self-signed upload certificate gives code 4; unsigned entries (16),
    # integrity failures, wrong signers and all other failure codes are rejected.
    unless [0, 4].include?(exit_code) && verify.match?(/^jar verified[.,]/)
      raise Stop, "AAB signature/integrity verification failed"
    end
    signers = certificate.scan(/SHA1:\s*([0-9A-F:]+)/).flatten.map { |s| s.delete(":") }.uniq
    raise Stop, "AAB signer does not match the Play upload certificate" unless signers == [expected_sha1]
  end

  def self.summary(plan, outcomes)
    return unless ENV["GITHUB_STEP_SUMMARY"]
    config = settings
    report = "## Android beta — #{plan.fetch('mode')}\n\n"
    report += "Commit: `#{plan.fetch('commit')}`\n\nVersion: #{plan.fetch('version_name')} (#{plan.fetch('version_code')})\n\n"
    report += "SHA-256: `#{plan.fetch('sha256', 'not built')}`\n\n"
    report += "[Workflow](https://github.com/briansgithub/acquiring/actions/runs/#{ENV.fetch('GITHUB_RUN_ID')})\n\n"
    report += "Internal: #{outcomes.fetch('internal')}\n\nClosed Alpha: #{outcomes.fetch('closed')}\n\n"
    report += "[Internal testers](#{config.fetch('internal_tester_url')}) · [Closed testers](#{config.fetch('closed_tester_url')})\n\n"
    report += "API acceptance is not Google approval. Check Play Console for review, managed publishing or other manual actions.\n"
    File.open(ENV.fetch("GITHUB_STEP_SUMMARY"), "a") { |file| file.write(report) }
  end

  def self.submit
    plan = JSON.parse(File.read(state_path))
    raise Stop, "Bundle checksum changed after verification" unless Digest::SHA256.file(plan.fetch("bundle_path")).hexdigest == plan.fetch("sha256")
    publisher = Publisher.new(Play.new, settings, plan)
    publisher.run(plan.fetch("bundle_path"), plan.fetch("mode"))
  ensure
    summary(plan, publisher ? publisher.outcomes : { "internal" => "not submitted", "closed" => "not submitted" }) if plan
  end

  def self.discover
    snapshot = Play.new.snapshot
    # Read-only observations: do not infer internal/closed roles from numeric URLs.
    public_state = snapshot.fetch("tracks").map do |track|
      { "track" => track["track"], "releases" => track.fetch("releases", []).map do |release|
        release.slice("name", "status", "versionCodes")
      end }
    end
    puts JSON.pretty_generate(public_state)
  rescue StandardError => error
    raise Stop, "Track discovery failed (#{error.class})"
  end
end
