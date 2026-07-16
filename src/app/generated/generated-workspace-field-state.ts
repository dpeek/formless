export function mergeGeneratedWorkspaceRecordFieldState<T>(
  queued: T,
  eventBaseline: T,
  applied: T,
): T {
  return applied === eventBaseline ? queued : applied;
}
