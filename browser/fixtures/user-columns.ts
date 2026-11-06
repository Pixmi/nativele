import "./status-badge.js";
import type { Column } from "./users.js";

export const userColumns: readonly Column[] = [
  { id: "name", header: "Name", cell: (u) => u.name, sort: (a, b) => a.name.localeCompare(b.name) },
  { id: "email", header: "Email", cell: (u) => u.email },
  {
    id: "status",
    header: "Status",
    cell: (u) => {
      const badge = document.createElement("status-badge");
      badge.status = u.status;
      return badge;
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: (u) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = "remove";
      button.ariaLabel = `Remove ${u.name}`;
      button.textContent = "Remove";
      return button;
    },
  },
];
