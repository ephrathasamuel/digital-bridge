export interface Point { x: number; y: number; z?: number }
export interface Frame { points: Point[]; handedness?: string }
export interface Sign { word: string; samples: number[][]; clips: number[][][] }
export interface Model { signs: Sign[] }
export interface Match { word: string; distance: number; votes: number }
export interface Segmenter { push(frame: Frame | null): Frame[] | null; readonly moving: boolean }

export const POINTS: number;
export const FORMAT: string;
export const VERSION: number;
export const CLIP_LEN: number;
export function normalise(points: Point[], handedness?: string): number[] | null;
export function distance(a: number[], b: number[]): number;
export function createModel(): Model;
export function addSample(model: Model, word: string, vector: number[]): boolean;
export function addClip(model: Model, word: string, clip: number[][] | null): boolean;
export function removeSign(model: Model, word: string): void;
export function threshold(model: Model): number;
export function clipThreshold(model: Model): number;
export function classify(model: Model, vector: number[] | null, options?: { k?: number; limit?: number }): Match | null;
export function steady(frames?: number): (word: string | null) => string | null;
export function travel(frames: Frame[]): number;
export function makeClip(frames: Frame[]): number[][] | null;
export function dtw(a: number[][], b: number[][]): number;
export function classifyClip(model: Model, clip: number[][] | null, options?: { limit?: number }): { word: string; distance: number } | null;
export function segmenter(options?: { start?: number; stop?: number; quiet?: number; minFrames?: number; maxFrames?: number; minTravel?: number }): Segmenter;
export function toJSON(model: Model): string;
export function fromJSON(text: string): Model | null;
export function reader(model: Model, options?: { hold?: number }): (seen: Frame | null) => { word: string | null; now: string };
