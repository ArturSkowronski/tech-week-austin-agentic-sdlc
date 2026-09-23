// Placeholder for a tool a later milestone builds. Scripts in package.json
// point here so every gate can run from the first commit; the ticket that
// builds the real tool repoints its script away from this stub.
const what = process.argv[2] ?? 'this tool';

process.stdout.write(`not yet: ${what}\n`);
