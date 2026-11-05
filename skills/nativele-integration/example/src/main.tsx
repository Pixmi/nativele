import "./nv/info-card.js";
import "./nv/text-field.js";
import "./nv/life-probe.js";
import "./nv/shadow-card.js";
import "./nv/light-card.js";
import { render } from "preact";
import { App } from "./app.tsx";

render(<App />, document.getElementById("app")!);
