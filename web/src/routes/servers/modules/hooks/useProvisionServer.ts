import { useMutation } from "@tanstack/react-query";
import { provisionServer } from "../services";

export function useProvisionServer() {
  return useMutation({ mutationFn: provisionServer });
}
