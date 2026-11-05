import "./nv/counter-card.ts";
import "./nv/todo-list.ts";
import "./nv/user-badge.ts";
import "./nv/light-panel.ts";
import "./nv/shadow-panel.ts";

const list = document.querySelector("todo-list");
if (list) list.todos = [{ id: 1, title: "Write tests", done: false }, { id: 2, title: "Run them in Chrome", done: false }];
