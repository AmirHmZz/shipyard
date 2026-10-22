import type { FormEvent } from "react";

import { useReducer } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { useResources } from "@/lib/hooks/useResources";
import { useAccount } from "@/lib/session";

import {
  initialNetworkFormState,
  networkFormReducer,
  networkFormSchema,
} from "../generics";
import { useCreateNetwork } from "./useCreateNetwork";
import { useNetworkInventory } from "./useNetworkInventory";

export function useNetworkForm() {
  const changes = useConfigurationChanges();
  const q = useResources();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const account = useAccount();
  const [state, dispatch] = useReducer(
    networkFormReducer,
    params,
    initialNetworkFormState,
  );
  const createNetwork = useCreateNetwork(state.server);
  const busy = createNetwork.isPending;
  const error = createNetwork.error ? describeError(createNetwork.error) : "";
  const inventory = useNetworkInventory(state.server, !!account?.admin);
  function setServer(value: string) {
    dispatch({ type: "server_changed", value });
  }
  function setMode(value: string) {
    dispatch({ type: "field_changed", field: "mode", value });
  }
  function setName(value: string) {
    dispatch({ type: "field_changed", field: "name", value });
  }
  function setSelected(value: string) {
    dispatch({ type: "field_changed", field: "selected", value });
  }
  function setSubnet(value: string) {
    dispatch({ type: "field_changed", field: "subnet", value });
  }
  function setRange(value: string) {
    dispatch({ type: "field_changed", field: "range", value });
  }
  function setV6(value: boolean) {
    dispatch({ type: "ipv6_changed", value });
  }
  function setSubnet6(value: string) {
    dispatch({ type: "field_changed", field: "subnet6", value });
  }
  function cancel() {
    changes.discard();
    navigate("/networks");
  }
  function submitNetwork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    createNetwork.reset();
    const parsed = networkFormSchema.safeParse(state);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    const values = parsed.data;
    createNetwork.mutate(
      {
        name: values.name,
        dockerId: values.mode === "existing" ? values.selected : "",
        subnet: values.mode === "create" ? values.subnet : "",
        dynamicRange: values.range,
        enableIPv6: values.v6,
        ipv6Subnet: values.subnet6,
      },
      {
        onSuccess: () => {
          changes.saved();
          navigate("/networks");
        },
      },
    );
  }
  return {
    state,
    derived: {
      q,
      account,
      inventory,
      busy,
      error,
      pendingNetwork: createNetwork.variables,
    },
    handlers: {
      setServer,
      setMode,
      setName,
      setSelected,
      setSubnet,
      setRange,
      setV6,
      setSubnet6,
      cancel,
      submitNetwork,
    },
  };
}
