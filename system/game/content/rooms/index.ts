// Every room in this directory, keyed by its file name. Adding a room is
// adding a file next to this one: there is no list to keep in step
// (AGENTS.md rule 2), the glob is the list. Vite leaves the importing module
// out of its own glob, so this file is not one of the rooms it finds.

const modules = import.meta.glob<string>('./*.ts', { eager: true, import: 'default' });

/** Room text by room name, for example `forest-glade`. */
export const rooms: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(modules).map(([path, text]) => [path.replace(/^\.\/|\.ts$/g, ''), text]),
);
