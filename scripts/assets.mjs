import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("public/products", { recursive: true });
const items = {
  shirt: {
    bg: "#eeeae1",
    fill: "#ddd5be",
    stroke: "#bdb69f",
    shape:
      "M112 82 L77 92 39 137 72 167 93 146 91 268 229 268 227 146 248 167 281 137 243 92 208 82 184 101 160 109 136 101 Z",
    detail:
      "M136 83 L160 109 144 132 119 92 M184 83 L160 109 176 132 201 92 M160 110 V268 M178 151 H208 V183 H178 Z M99 247 H223",
  },
  blazer: {
    bg: "#e7e7e1",
    fill: "#71786f",
    stroke: "#505e53",
    shape:
      "M124 73 L82 90 61 112 31 264 70 273 99 155 97 283 224 283 222 155 250 273 290 264 259 112 238 90 195 73 160 110 Z",
    detail:
      "M126 77 L108 128 144 146 133 165 177 234 M193 77 L210 127 176 146 188 165 145 242 M160 109 V181 M114 216 H144 M181 216 H211 M99 266 H223",
  },
  jeans: {
    bg: "#e6e9e6",
    fill: "#7c91a0",
    stroke: "#5c7586",
    shape:
      "M102 63 H218 L229 137 222 297 170 297 160 166 149 297 96 297 90 137 Z",
    detail:
      "M103 79 H217 M146 80 V137 L160 150 M176 80 V135 M104 85 Q108 117 140 118 M214 85 Q210 117 182 118 M99 280 H149 M171 280 H223 M160 150 L160 166",
  },
  knit: {
    bg: "#e6eade",
    fill: "#a7b196",
    stroke: "#8b987a",
    shape:
      "M126 82 L89 93 62 118 31 240 68 252 98 157 97 270 224 270 222 157 252 252 288 240 259 118 232 93 195 82 Q194 108 160 110 Q127 108 126 82 Z",
    detail:
      "M132 83 Q135 103 160 103 Q186 103 189 83 M99 249 H222 M103 253 V268 M110 253 V268 M117 253 V268 M124 253 V268 M131 253 V268 M138 253 V268 M145 253 V268 M152 253 V268 M159 253 V268 M166 253 V268 M173 253 V268 M180 253 V268 M187 253 V268 M194 253 V268 M201 253 V268 M208 253 V268 M215 253 V268 M40 222 L73 235 M246 235 L281 223",
  },
  tote: {
    bg: "#eeeae1",
    fill: "#d8c9a7",
    stroke: "#b8a98c",
    shape: "M88 127 H232 L247 278 Q160 294 73 278 Z",
    detail:
      "M113 152 V98 Q112 53 160 53 Q209 53 207 98 V152 M127 152 V98 Q127 68 160 68 Q194 68 193 98 V152 M88 144 H232 M91 263 Q160 276 229 263",
  },
  dress: {
    bg: "#eee5dd",
    fill: "#ba8d7c",
    stroke: "#a37666",
    shape:
      "M126 58 L95 82 81 132 113 144 124 113 129 159 74 283 Q160 307 247 283 L192 159 197 113 208 144 239 132 224 82 193 58 Q161 88 126 58 Z",
    detail:
      "M131 63 Q161 98 189 63 M129 159 Q160 168 192 159 M144 170 L124 277 M176 170 L196 277 M160 177 V281 M85 270 Q160 291 236 270",
  },
};
for (const [name, v] of Object.entries(items)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 360"><defs><filter id="s"><feDropShadow dx="0" dy="9" stdDeviation="9" flood-color="#3b4930" flood-opacity=".1"/></filter><pattern id="t" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 0L5 5" stroke="white" stroke-opacity=".07" stroke-width=".5"/></pattern></defs><path fill="${v.bg}" d="M0 0H320V360H0z"/><ellipse cx="160" cy="315" rx="88" ry="8" fill="#263b27" opacity=".04"/><g filter="url(#s)"><path d="${v.shape}" fill="${v.fill}" stroke="${v.stroke}" stroke-width="1.2" stroke-linejoin="round"/><path d="${v.shape}" fill="url(#t)"/><path d="${v.detail}" fill="none" stroke="${v.stroke}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></g>${name === "shirt" ? '<g fill="#b5ad95"><circle cx="160" cy="150" r="2"/><circle cx="160" cy="177" r="2"/><circle cx="160" cy="204" r="2"/><circle cx="160" cy="231" r="2"/></g>' : ""}</svg>`;
  writeFileSync(`public/products/${name}.svg`, svg);
}
