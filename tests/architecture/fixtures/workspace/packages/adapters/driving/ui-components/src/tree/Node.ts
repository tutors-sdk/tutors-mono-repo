// Allowed: a cycle inside one package (recursive rendering).
import { children } from "./Children.ts";
export const node = () => children;
