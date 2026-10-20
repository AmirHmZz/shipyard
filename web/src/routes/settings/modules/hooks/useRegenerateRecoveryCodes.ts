import { useMutation } from "@tanstack/react-query";

import { regenerateRecoveryCodes } from "../services";

export function useRegenerateRecoveryCodes() {
  return useMutation({ mutationFn: regenerateRecoveryCodes });
}
