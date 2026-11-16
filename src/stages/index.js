import { camp } from './camp.js';
import { convoy } from './convoy.js';
import { border } from './border.js';

export const STAGES = [camp, convoy, border];
export const stageById = (id) => STAGES.find((s) => s.id === id);
