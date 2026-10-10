export const defaultAnalysisOptions = { yolo: true, shuttle: true, ground: true, pose: true, shots: false, llm: false, ending: false };
export type AnalysisOptions = Omit<typeof defaultAnalysisOptions,'ending'> & {ending?: boolean};
export function analysisOptions(value: unknown): AnalysisOptions {
  if (value === undefined) return { ...defaultAnalysisOptions };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose valid analysis options.');
  const options = {ending:false,...value} as Record<string, unknown>;
  if (Object.keys(options).some(key => !Object.hasOwn(defaultAnalysisOptions,key)) || Object.keys(defaultAnalysisOptions).some(key => typeof options[key] !== 'boolean')) throw new Error('Analysis options must be boolean switches.');
  const result = options as AnalysisOptions;
  if (result.ground && !result.shuttle) throw new Error('Ground-touch checks require shuttle tracking.');
  if (result.pose && !result.yolo) throw new Error('Body pose requires YOLO player tracking.');
  if (result.shots && (!result.pose || !result.shuttle)) throw new Error('Shot classification requires body pose and shuttle tracking.');
  if (result.llm && !result.shots) throw new Error('LLM coaching requires shot classification.');
  if (result.ending && (!result.ground || !result.pose || !result.shuttle)) throw new Error('Ending review requires ground checks, body pose and shuttle tracking.');
  if (!result.yolo && !result.shuttle) throw new Error('Enable player or shuttle tracking.');
  return { ...result };
}
