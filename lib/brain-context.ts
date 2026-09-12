/** Keep a bounded, explicitly partial board context; callers provide only authorized tasks. */
export function boardContext(request: string, tasks: { id: string; title: string; status: string; [key: string]: unknown }[]): string {
  const board: typeof tasks = [];
  const stats = { total: tasks.length, done: tasks.filter((t) => t.status === "done").length, doing: tasks.filter((t) => t.status === "in_progress").length };
  let bytes = Buffer.byteLength(JSON.stringify({ request, stats, board, omitted: tasks.length }));
  for (const task of tasks) {
    const card = { ...task, title: [...task.title].slice(0, 250).join("") };
    const size = Buffer.byteLength(JSON.stringify(card)) + 1;
    if (bytes + size > 12000) break;
    board.push(card); bytes += size;
  }
  return JSON.stringify({ request, stats, board, omitted: tasks.length - board.length });
}
export function boundedSummary(text: string): string {
  let result = "";
  for (const line of text.split("\n")) {
    if (Buffer.byteLength(result + line) > 11000) return result + "\nAdditional task details omitted for length.";
    result += line + "\n";
  }
  return result;
}
