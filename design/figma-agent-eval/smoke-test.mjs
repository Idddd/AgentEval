import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const base = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const source = fs.readFileSync(path.join(base, "code.js"), "utf8");

function makeNode(type, name = type) {
  const node = {
    type,
    name,
    children: [],
    parent: null,
    fills: [],
    strokes: [],
    opacity: 1,
    resize(width, height) { this.width = width; this.height = height; },
    appendChild(child) {
      if (child.parent) child.remove();
      this.children.push(child);
      child.parent = this;
      return child;
    },
    remove() {
      if (!this.parent) return;
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
      this.parent = null;
    },
    async loadAsync() {}
  };
  return node;
}

const root = makeNode("DOCUMENT", "Document");
const initialPage = makeNode("PAGE", "Page 1");
root.appendChild(initialPage);
let currentPage = initialPage;
let completion;
const done = new Promise((resolve) => { completion = resolve; });
const collections = [];

const figma = {
  root,
  get currentPage() { return currentPage; },
  set currentPage(page) { currentPage = page; },
  createPage() { const page = makeNode("PAGE", "Untitled"); root.appendChild(page); return page; },
  createFrame() { return makeNode("FRAME"); },
  createRectangle() { return makeNode("RECTANGLE"); },
  createText() { return makeNode("TEXT"); },
  createComponent() { return makeNode("COMPONENT"); },
  combineAsVariants(nodes, parent) {
    const set = makeNode("COMPONENT_SET", "Variants");
    parent.appendChild(set);
    nodes.forEach((node) => set.appendChild(node));
    return set;
  },
  variables: {
    async getLocalVariableCollectionsAsync() { return collections.slice(); },
    createVariableCollection(name) {
      const collection = {
        name,
        modes: [{ modeId: `${name}-mode-1`, name: "Mode 1" }],
        renameMode(id, nameValue) { const mode = this.modes.find((item) => item.modeId === id); if (mode) mode.name = nameValue; },
        addMode(nameValue) { const id = `${name}-mode-${this.modes.length + 1}`; this.modes.push({ modeId: id, name: nameValue }); return id; },
        remove() { const index = collections.indexOf(this); if (index >= 0) collections.splice(index, 1); }
      };
      collections.push(collection);
      return collection;
    },
    createVariable() { return { setValueForMode() {} }; }
  },
  async loadAllPagesAsync() {},
  async loadFontAsync() {},
  viewport: { scrollAndZoomIntoView() {} },
  notify() {},
  closePlugin(message) { completion(message); }
};

vm.runInNewContext(source, { figma, console, Promise, Object, Array, String, Number, Math, parseInt, setTimeout, clearTimeout }, { filename: "code.js" });
const message = await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error("plugin timed out")), 10000))]);

if (!message.includes("71 editable")) throw new Error(`unexpected completion message: ${message}`);
const generatedPages = root.children.map((page) => page.name).filter((name) => name !== "Page 1");
if (generatedPages.length !== 12) throw new Error(`expected 12 pages, received ${generatedPages.length}`);
const screenCount = root.children.flatMap((page) => page.children).filter((node) => node.width === 1440 && node.height === 1024).length;
if (screenCount < 71) throw new Error(`expected at least 71 screen frames, received ${screenCount}`);

console.log(JSON.stringify({ completion: message, generatedPages: generatedPages.length, fullScreenFrames: screenCount }, null, 2));
