import assert from "node:assert/strict";
import test from "node:test";

import { renderQuizSectionPicker } from "./quizMode.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  async emit(name) {
    for (const listener of this.listeners.get(name) || []) await listener();
  }
}

class FakeDocument {
  constructor() {
    this.createdTags = [];
  }

  createElement(tagName) {
    this.createdTags.push(tagName.toLowerCase());
    return new FakeElement(tagName, this);
  }
}

test("quiz section switching renders imported names only as option text", async () => {
  const doc = new FakeDocument();
  const bar = new FakeElement("div", doc);
  const malicious = '</option><img src=x onerror="globalThis.pwned=1"><option>';
  const selected = [];

  const select = renderQuizSectionPicker(
    bar,
    [{ sectionName: "Verse" }, { sectionName: malicious }],
    0,
    (index) => selected.push(index),
  );

  assert.deepEqual(doc.createdTags, ["label", "select", "option", "option", "span"]);
  assert.equal(select.children[1].tagName, "OPTION");
  assert.equal(select.children[1].textContent, malicious);
  assert.equal(doc.createdTags.includes("img"), false);

  select.value = "1";
  await select.emit("change");
  assert.deepEqual(selected, [1]);
});

test("quiz section switching ignores out-of-range values and clears an empty picker", async () => {
  const doc = new FakeDocument();
  const bar = new FakeElement("div", doc);
  let switches = 0;
  const select = renderQuizSectionPicker(bar, [{ name: "Only" }], 0, () => switches++);
  select.value = "9";
  await select.emit("change");
  assert.equal(switches, 0);

  assert.equal(renderQuizSectionPicker(bar, [], 0, () => switches++), null);
  assert.equal(bar.children.length, 0);
});
