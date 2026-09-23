// Entry point. The renderer mounts into #game in M2; for now this only proves
// the container exists, so a broken index.html fails loudly instead of quietly.
const container = document.querySelector<HTMLDivElement>('#game');

if (container === null) {
  throw new Error('index.html must provide a #game container');
}

export {};
