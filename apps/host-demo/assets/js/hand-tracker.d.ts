import type { Frame } from './hand-signs.js';

export interface HandTracker { detectForVideo(video: HTMLVideoElement, time: number): unknown }
export const MEDIAPIPE: string;
export const HAND_MODEL: string;
export const SIGNS_STORE: string;
export function loadTracker(): Promise<HandTracker>;
export function detect(tracker: HandTracker, video: HTMLVideoElement): Frame | null;
