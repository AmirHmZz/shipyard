import { createContext } from "react";

import type { useResourceFormController } from "./useResourceFormController";
type FormContextValue = ReturnType<typeof useResourceFormController>;
export const ResourceFormContext = createContext<FormContextValue | null>(null);
