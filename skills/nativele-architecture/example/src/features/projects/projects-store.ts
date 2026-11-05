import { createStore } from "@nativele/ts-dom";

export interface Project {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
}

export interface ProjectsState {
  projects: readonly Project[];
  tasks: readonly Task[];
  nextId: number;
}

export function seedProjects(): ProjectsState {
  return {
    projects: [
      { id: "p1", name: "Website" },
      { id: "p2", name: "Mobile app" },
    ],
    tasks: [
      { id: "t1", projectId: "p1", title: "Write the copy", done: true },
      { id: "t2", projectId: "p1", title: "Pick the fonts", done: false },
      { id: "t3", projectId: "p1", title: "Publish", done: false },
      { id: "t4", projectId: "p2", title: "Sketch the screens", done: false },
    ],
    nextId: 5,
  };
}

export const projects = createStore<ProjectsState>(seedProjects());

export function addProject(name: string): string {
  const id = `p${projects.get().nextId}`;
  projects.set((s) => ({ ...s, projects: [...s.projects, { id, name }], nextId: s.nextId + 1 }));
  return id;
}

export function addTask(projectId: string, title: string): void {
  projects.set((s) => ({ ...s, tasks: [...s.tasks, { id: `t${s.nextId}`, projectId, title, done: false }], nextId: s.nextId + 1 }));
}

export function toggleTask(id: string): void {
  projects.set((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
}

export function tasksOf(s: ProjectsState, projectId: string): readonly Task[] {
  return s.tasks.filter((t) => t.projectId === projectId);
}
