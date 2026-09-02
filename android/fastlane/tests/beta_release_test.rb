# frozen_string_literal: true

require "minitest/autorun"
require_relative "../lib/beta_release"
require "google/apis/androidpublisher_v3"
require "googleauth"

class FakePlay
  attr_reader :uploads, :commits, :writes, :discarded, :validations
  attr_accessor :upload_timeout, :commit_timeout, :closed_failure, :read_failure, :no_commit, :drop_internal

  def initialize
    @live = { "tracks" => [{ "track" => "internal", "releases" => [] }, { "track" => "alpha", "releases" => [] }], "bundles" => [], "apks" => [] }
    @edits, @uploads, @commits, @writes, @discarded, @validations = {}, 0, 0, [], [], 0
    @next = 0
  end

  def copy(object)
    Marshal.load(Marshal.dump(object))
  end

  def snapshot(edit = nil)
    raise Timeout::Error if read_failure
    copy(edit ? @edits.fetch(edit) : @live)
  end

  def seed(snapshot)
    @live = copy(snapshot)
  end

  def begin_edit
    @next += 1
    @edits[@next] = copy(@live)
    @next
  end

  def discard(edit)
    @discarded << edit
    @edits.delete(edit)
  end

  def upload(edit, _path)
    @uploads += 1
    bundle = { "versionCode" => 9, "sha256" => "a" * 64 }
    @edits.fetch(edit)["bundles"] << bundle
    raise Timeout::Error if upload_timeout
    copy(bundle)
  end

  def set_release(edit, id, plan, allowed)
    raise BetaRelease::Stop unless allowed.include?(id) && id != "production"
    raise Timeout::Error if closed_failure && id == "alpha"
    @writes << [id, plan.fetch("version_code")]
    @edits.fetch(edit)["tracks"].find { |t| t["track"] == id }["releases"] = [{
      "name" => plan["release_name"], "status" => "completed", "versionCodes" => [plan["version_code"].to_s]
    }]
  end

  def validate(_edit)
    @validations += 1
  end

  def commit(edit)
    @commits += 1
    @live = copy(@edits.fetch(edit)) unless no_commit
    @live["tracks"][0]["releases"] = [] if drop_internal && @commits == 2
    raise Timeout::Error if commit_timeout || no_commit
  end
end

class BetaReleaseTest < Minitest::Test
  def setup
    @config = { "package_name" => BetaRelease::PACKAGE, "tracks_verified_from_api" => true, "internal_track" => "internal", "closed_track" => "alpha" }
    @plan = { "version_code" => 9, "release_name" => "beta-#{'b' * 40}", "notes" => "Music improvements", "sha256" => "a" * 64 }
    @play = FakePlay.new
    @publisher = BetaRelease::Publisher.new(@play, @config, @plan)
  end

  def test_publish_uploads_once_and_promotes_exact_version
    result = @publisher.run("bundle.aab", "publish")
    assert_equal 1, @play.uploads
    assert_equal 2, @play.commits
    assert_equal [["internal", 9], ["alpha", 9]], @play.writes
    assert result.values.all? { |v| v.include?("review/availability not confirmed") }
    %w[internal alpha].each { |id| assert BetaRelease.matches?(@play.snapshot, id, @plan) }
  end

  def test_validation_discards_edit_without_publishing
    result = @publisher.run("bundle.aab", "validate")
    assert_equal 0, @play.commits
    assert_equal 1, @play.validations
    assert_equal [], @play.snapshot["bundles"]
    assert result.values.all? { |v| v.include?("no release published") }
  end

  def test_unknown_tracks_fail_closed
    [nil, "production", "beta", "4698760930864432997/production"].each do |id|
      assert_raises(BetaRelease::Stop) { BetaRelease.tracks!(@config.merge("closed_track" => id)) }
    end
    assert_raises(BetaRelease::Stop) { BetaRelease.tracks!(@config.merge("tracks_verified_from_api" => false)) }
    assert_raises(BetaRelease::Stop) { @play.set_release(@play.begin_edit, "production", @plan, %w[internal alpha]) }
  end

  def test_notes_length
    BetaRelease.check_notes!("a" * 500)
    [nil, "", " ", "a" * 501].each { |n| assert_raises(BetaRelease::Stop) { BetaRelease.check_notes!(n) } }
  end

  def test_allocate_above_repository_bundles_apks_and_all_tracks
    snapshot = @play.snapshot
    snapshot["bundles"] = [{ "versionCode" => 100 }]
    snapshot["apks"] = [{ "versionCode" => 101 }]
    snapshot["tracks"] << { "track" => "production", "releases" => [{ "versionCodes" => ["102"] }] }
    assert_equal 103, BetaRelease.next_code(4, snapshot)
    assert_equal 106, BetaRelease.next_code(105, snapshot)
    assert_raises(BetaRelease::Stop) { BetaRelease.next_code(BetaRelease::LIMIT, snapshot) }
  end

  def test_duplicate_version_is_rejected_before_upload
    snapshot = @play.snapshot
    snapshot["bundles"] << { "versionCode" => 9 }
    @play.seed(snapshot)
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    assert_equal 0, @play.uploads
  end

  def test_downgrade_and_unfinished_release_are_rejected
    snapshot = @play.snapshot
    snapshot["tracks"][1]["releases"] = [{ "status" => "completed", "versionCodes" => ["10"] }]
    @play.seed(snapshot)
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    snapshot["tracks"][1]["releases"] = [{ "status" => "draft", "versionCodes" => ["8"] }]
    @play.seed(snapshot)
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    assert_equal 0, @play.uploads
  end

  def test_upload_timeout_reconciles_hash_without_reupload
    @play.upload_timeout = true
    @publisher.run("bundle.aab", "publish")
    assert_equal 1, @play.uploads
    assert_equal 2, @play.commits
  end

  def test_lost_commit_response_reconciles_without_recommit
    @play.commit_timeout = true
    @publisher.run("bundle.aab", "publish")
    assert_equal 2, @play.commits
  end

  def test_uncertain_commit_stops_without_retry
    @play.no_commit = true
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    assert_equal 1, @play.commits
    assert_includes @publisher.outcomes["internal"], "manual action required"
    assert_equal "not submitted", @publisher.outcomes["closed"]
  end

  def test_partial_success_preserves_internal
    @play.closed_failure = true
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    assert BetaRelease.matches?(@play.snapshot, "internal", @plan)
    refute BetaRelease.matches?(@play.snapshot, "alpha", @plan)
    assert_equal 1, @play.uploads
    assert_equal 1, @play.commits
    assert_includes @publisher.outcomes["internal"], "API accepted"
  end

  def test_both_tracks_must_retain_version
    @play.drop_internal = true
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    assert_includes @publisher.outcomes["internal"], "manual action required"
  end

  def test_initial_timeout_never_uploads
    @play.read_failure = true
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    assert_equal 0, @play.uploads
  end

  def test_unknown_mode_never_uploads
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "production") }
    assert_equal 0, @play.uploads
  end

  def test_real_sdk_configuration_supports_adc_and_disables_retries
    Google::Auth.stub(:get_application_default, Object.new) do
      adapter = BetaRelease::Play.new
      service = adapter.instance_variable_get(:@service)
      assert_equal 0, service.request_options.retries
      assert_equal 300, service.client_options.read_timeout_sec
      %i[insert_edit list_edit_tracks list_edit_bundles list_edit_apks upload_edit_bundle update_edit_track validate_edit commit_edit delete_edit].each do |method|
        assert_respond_to service, method
      end
    end
  end

  def test_real_adapter_writes_only_the_exact_version_and_requests_review
    Google::Auth.stub(:get_application_default, Object.new) do
      adapter = BetaRelease::Play.new
      service = adapter.instance_variable_get(:@service)
      captured = nil
      service.stub(:update_edit_track, ->(*args) { captured = args }) do
        adapter.set_release("edit", "alpha", @plan, %w[internal alpha])
      end
      assert_equal [BetaRelease::PACKAGE, "edit", "alpha"], captured.first(3)
      body = JSON.parse(captured.last.to_json)
      assert_equal ["9"], body["releases"][0]["versionCodes"]
      assert_equal "completed", body["releases"][0]["status"]
      assert_equal [{ "language" => "en-US", "text" => "Music improvements" }], body["releases"][0]["releaseNotes"]
      assert_equal %w[releases track], body.keys.sort
      assert_raises(BetaRelease::Stop) { adapter.set_release("edit", "production", @plan, %w[internal alpha]) }
      assert_raises(BetaRelease::Stop) { adapter.set_release("edit", "other", @plan, %w[internal alpha]) }
      service.stub(:commit_edit, ->(*args, **kwargs) { captured = [args, kwargs] }) { adapter.commit("edit") }
      assert_equal [[BetaRelease::PACKAGE, "edit"], { changes_not_sent_for_review: false }], captured
    end
  end

  def test_upload_identity_mismatch_never_commits
    @play.define_singleton_method(:upload) { |_edit, _path| { "versionCode" => 9, "sha256" => "wrong" } }
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    assert_equal 0, @play.commits
  end

  def test_upload_timeout_without_matching_server_bundle_never_retries
    @play.define_singleton_method(:upload) { |_edit, _path| @uploads += 1; raise Timeout::Error }
    assert_raises(BetaRelease::Stop) { @publisher.run("bundle.aab", "publish") }
    assert_equal 1, @play.uploads
    assert_equal 0, @play.commits
  end

  def test_signed_bundle_output_allows_pinned_self_signed_key_but_not_unsigned_entries
    expected = "A" * 40
    certificate = "SHA1: #{(['AA'] * 20).join(':')}"
    BetaRelease.check_signature!("jar verified, with signer errors.\n", 4, certificate, expected)
    BetaRelease.check_signature!("jar verified.\n", 0, certificate, expected)
    [1, 16, 20].each do |code|
      assert_raises(BetaRelease::Stop) { BetaRelease.check_signature!("jar verified.", code, certificate, expected) }
    end
    assert_raises(BetaRelease::Stop) { BetaRelease.check_signature!("jar is unsigned.", 0, certificate, expected) }
    assert_raises(BetaRelease::Stop) { BetaRelease.check_signature!("jar verified.", 0, certificate, "B" * 40) }
  end

  def test_actual_manifest_fields_are_checked
    manifest = '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.acquiring.android" android:versionCode="9" android:versionName="1.0"><uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36"/><application android:debuggable="false"/></manifest>'
    plan = @plan.merge("version_name" => "1.0")
    BetaRelease.check_manifest!(manifest, plan)
    [["com.acquiring.android", "other.app"], ['versionCode="9"', 'versionCode="10"'],
     ['versionName="1.0"', 'versionName="2.0"'], ['minSdkVersion="26"', 'minSdkVersion="36"'],
     ['targetSdkVersion="36"', 'targetSdkVersion="35"'], ['debuggable="false"', 'debuggable="true"']].each do |from, to|
      assert_raises(BetaRelease::Stop) { BetaRelease.check_manifest!(manifest.sub(from, to), plan) }
    end
  end
end
