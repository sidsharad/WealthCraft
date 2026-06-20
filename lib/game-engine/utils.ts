import { GameState } from "../db/schema";

export const MAX_LOG_ENTRIES = 50;
export const MAX_PROCESSED_ACTIONS = 50;

export function trimGameState(state: GameState): GameState {
  if (!state) return state;
  
  let trimmedLog = state.log || [];
  if (trimmedLog.length > MAX_LOG_ENTRIES) {
    trimmedLog = trimmedLog.slice(-MAX_LOG_ENTRIES);
  }

  let trimmedActions = state.processedActionIds || [];
  if (trimmedActions.length > MAX_PROCESSED_ACTIONS) {
    trimmedActions = trimmedActions.slice(-MAX_PROCESSED_ACTIONS);
  }

  return {
    ...state,
    log: trimmedLog,
    processedActionIds: trimmedActions,
  };
}
