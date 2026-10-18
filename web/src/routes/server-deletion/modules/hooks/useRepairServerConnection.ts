import { useMutation } from "@tanstack/react-query";
import { repairServerConnection } from "../services";

type Connection = Parameters<typeof repairServerConnection>[1];

export function useRepairServerConnection(serverId: string) {
  return useMutation({
    mutationFn: (connection: Connection) =>
      repairServerConnection(serverId, connection),
  });
}
