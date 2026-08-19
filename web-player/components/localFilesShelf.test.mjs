import assert from "node:assert/strict";
import test from "node:test";

import {
  analysisDownloadFilename,
  errorMessage,
  localItemViewModel,
  normalizeLocalSong,
  renderLocalFilesShelf,
} from "./localFilesShelf.js";
import { replaceSectionOptions, sectionOptionLabel } from "./controls.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.textContent = "";
    this.className = "";
    this.value = "";
    this.files = [];
  }

  append(...children) {
    this.children.push(...children);
    for (const child of children) child.parentElement = this;
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  async emit(name) {
    for (const listener of this.listeners.get(name) || []) {
      await listener({ target: this });
    }
  }

  click() {
    this.clicked = true;
    return this.emit("click");
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }
}

class FakeDocument {
  constructor() {
    this.createdTags = [];
    this.body = new FakeElement("body", this);
  }

  createElement(tagName) {
    this.createdTags.push(tagName.toLowerCase());
    return new FakeElement(tagName, this);
  }
}

function findByClass(root, className) {
  if (String(root.className).split(/\s+/).includes(className)) return root;
  for (const child of root.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const SECTION = {
  sectionName: "Verse",
  inlineData: {
    chords: [{ root: 1, type: 5, inversion: 0, beat: 1, duration: 4 }],
    notes: [],
    metadata: {
      keys: [{ tonic: "C", scale: "major", beat: 1 }],
      tempos: [{ bpm: 120, beat: 1 }],
      meters: [{ numBeats: 4, beatUnit: 4, beat: 1 }],
      endBeat: 5,
    },
  },
};

test("local item aliases and analysis filenames are normalized", () => {
  assert.deepEqual(localItemViewModel({
    id: "abc",
    source_type: "MIDI",
    filename: "source.mid",
    displayFilename: "source (2).mid",
    section_count: 2,
    created_at: "2026-08-19T12:00:00Z",
  }), {
    id: "abc",
    sourceType: "midi",
    filename: "source (2).mid",
    sectionCount: 2,
    createdAt: "2026-08-19T12:00:00Z",
  });
  assert.equal(analysisDownloadFilename("C:\\Music\\demo.midi"), "demo.analysis.json");
  assert.equal(analysisDownloadFilename("bad:name?.mid"), "bad_name_.analysis.json");
  assert.equal(errorMessage({ error: { message: "Too large" } }, 413), "Too large");
});

test("local songs receive a stable key and retain literal untrusted labels", () => {
  const malicious = '<img src=x onerror="globalThis.pwned=1">';
  const song = normalizeLocalSong({
    title: malicious,
    artist: "Local MIDI",
    sections: [{ ...SECTION, sectionName: malicious }],
  }, { id: "123", filename: "demo.mid" });

  assert.equal(song.key, "local:123");
  assert.equal(song.id, "local:123");
  assert.equal(song.title, malicious);
  assert.equal(song.sections[0].sectionName, malicious);
  assert.equal(song.sections[0].sectionIndex, 0);
  assert.throws(
    () => normalizeLocalSong({ key: "local:123", sections: [{ sectionName: "Bad" }] }),
    /missing its theory data/,
  );
});

test("section options use textContent rather than interpolated HTML", () => {
  const doc = new FakeDocument();
  const select = doc.createElement("select");
  const malicious = "<script>globalThis.pwned=1</script>";
  replaceSectionOptions(select, [{ sectionName: malicious }, {}]);

  assert.equal(sectionOptionLabel({}, 1), "Section 2");
  assert.equal(select.children.length, 2);
  assert.equal(select.children[0].tagName, "OPTION");
  assert.equal(select.children[0].textContent, malicious);
  assert.equal(doc.createdTags.includes("script"), false);
});

test("shelf renders server names as text and opens a saved local song", async () => {
  const doc = new FakeDocument();
  const container = doc.createElement("div");
  const filename = '<img src=x onerror="globalThis.pwned=1">.mid';
  const item = {
    id: "abc",
    sourceType: "midi",
    filename,
    sectionCount: 1,
    createdAt: "2026-08-19T12:00:00Z",
  };
  const olderItem = {
    id: "older",
    sourceType: "theory",
    filename: "older.json",
    sectionCount: 1,
    createdAt: "2026-08-18T12:00:00Z",
  };
  let openedSong = null;
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    if (url === "/api/v1/local-library") return response({ items: [olderItem, item] });
    if (url === "/api/v1/local-library/abc") {
      return response({
        item,
        song: { key: "local:abc", title: "Demo", artist: "Local MIDI", sections: [SECTION] },
      });
    }
    return response({ error: { message: "Unexpected request" } }, 500);
  };

  const shelf = renderLocalFilesShelf(container, {
    documentRef: doc,
    fetchImpl,
    onOpenSong: async (song) => { openedSong = song; },
  });
  await shelf.refresh();

  const name = findByClass(container, "local-file-name");
  assert.equal(name.textContent, filename);
  assert.equal(doc.createdTags.includes("img"), false);
  await findByClass(container, "local-file-main").emit("click");
  assert.equal(openedSong.key, "local:abc");
  assert.ok(requests.includes("/api/v1/local-library/abc"));
});

test("MIDI selection posts multipart data, opens the song, and downloads analysis", async () => {
  const doc = new FakeDocument();
  const container = doc.createElement("div");
  const item = { id: "m1", sourceType: "midi", filename: "demo.mid", sectionCount: 1 };
  const song = { key: "local:m1", title: "Demo", artist: "Local MIDI", sections: [SECTION] };
  const requests = [];
  const appended = [];
  const objectUrls = [];
  let opened = null;

  class FakeFormData {
    append(...values) { appended.push(values); }
  }
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
    }
  }
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (url.startsWith("/api/v1/local-library/midi")) {
      return response({ item, song, analysis: { format: "hooktheory.midi-analysis.v1" } });
    }
    return response({ items: [item] });
  };

  const shelf = renderLocalFilesShelf(container, {
    documentRef: doc,
    fetchImpl,
    FormDataCtor: FakeFormData,
    BlobCtor: FakeBlob,
    urlApi: {
      createObjectURL: () => {
        objectUrls.push("blob:test");
        return "blob:test";
      },
      revokeObjectURL: () => {},
    },
    defer: (callback) => callback(),
    onOpenSong: async (value) => { opened = value; },
  });
  await shelf.refresh();
  const input = findByClass(container, "local-files-input");
  const file = { name: "demo.mid" };
  input.files = [file];
  await input.emit("change");

  const post = requests.find(({ url }) => url.startsWith("/api/v1/local-library/midi"));
  assert.equal(post.url, "/api/v1/local-library/midi?topK=5");
  assert.equal(post.init.method, "POST");
  assert.deepEqual(appended[0], ["file", file, "demo.mid"]);
  assert.equal(opened.key, "local:m1");
  assert.deepEqual(objectUrls, ["blob:test"]);
  const anchor = doc.createdTags.includes("a");
  assert.equal(anchor, true);
});

test("failed imports report the error without opening another song", async () => {
  const doc = new FakeDocument();
  const container = doc.createElement("div");
  let openCount = 0;
  const fetchImpl = async (url) => {
    if (url === "/api/v1/local-library") return response({ items: [] });
    return response({ error: { code: "INVALID_THEORY", message: "Bad chord at sections[0].chords[2]" } }, 422);
  };

  const shelf = renderLocalFilesShelf(container, {
    documentRef: doc,
    fetchImpl,
    FormDataCtor: class { append() {} },
    onOpenSong: async () => { openCount++; },
  });
  await shelf.refresh();
  const inputs = [];
  const visit = (element) => {
    if (String(element.className).split(/\s+/).includes("local-files-input")) inputs.push(element);
    for (const child of element.children || []) visit(child);
  };
  visit(container);
  inputs[1].files = [{ name: "bad.json" }];
  await inputs[1].emit("change");

  assert.equal(openCount, 0);
  assert.match(findByClass(container, "local-files-status").textContent, /Bad chord/);
});
