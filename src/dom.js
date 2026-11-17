export function el(tag, className = "", text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
export function button(text, action, className = "") {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function option(value, label = value) {
  const node = el("option", "", label);
  node.value = String(value);
  return node;
}
export function downloadJSON(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const fieldNames = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  "multi-select": "Multi-select",
  rating: "Rating",
  file: "File",
  matrix: "Matrix",
};
export const fieldIcons = {
  text: "Aa",
  number: "#",
  date: "◷",
  select: "▾",
  "multi-select": "☷",
  rating: "☆",
  file: "↥",
  matrix: "▦",
};
