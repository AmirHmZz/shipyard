import { createContext } from "react";

import type { Options } from "./types";

import { emptyOptions } from "./constants";

export const ResourceOptionsContext = createContext<Options>(emptyOptions);
