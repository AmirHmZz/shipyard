import { useMutation } from "@tanstack/react-query";

import { changePassword } from "../services";

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}
