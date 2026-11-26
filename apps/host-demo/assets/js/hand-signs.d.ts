export interface Point { x: number; y: number; z?: number }
export interface Sign { word: string; samples: number[][] }
export interface Model { signs: Sign[] }
export interface Match { word: string; distance: number; votes: number }

export const POINTS: number;
export const FORMAT: string;
export const VERSION: number;
export function normalise(points: Point[], handedness?: string): number[] | null;
export function distance(a: number[], b: number[]): number;
export function createModel(): Model;
export function addSample(model: Model, word: string, vector: number[]): boolean;
export function removeSign(model: Model, word: string): void;
export function threshold(model: Model): number;
export function classify(model: Model, vector: number[] | null, options?: { k?: number; limit?: number }): Match | null;
export function steady(frames?: number): (word: string | null) => string | null;
export function toJSON(model: Model): string;
export function fromJSON(text: string): Model | null;
