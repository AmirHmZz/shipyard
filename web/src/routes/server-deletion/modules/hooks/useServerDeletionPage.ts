import type { FormEvent } from "react";

import { useReducer } from "react";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useResources } from "@/lib/hooks/useResources";
import { useAccount } from "@/lib/session";

import {
  initialServerDeletionPageState,
  serverDeletionPageReducer,
  serverDeletionSchema,
} from "../generics";
import { useConfirmServerDeletion } from "./useConfirmServerDeletion";
import { useRetryServerDeletion } from "./useRetryServerDeletion";
import { useReviewServerDeletion } from "./useReviewServerDeletion";
import { useServerDeletionStatus } from "./useServerDeletionStatus";

export function useServerDeletionPage(id: string) {
  const account = useAccount();
  const resources = useResources();
  const server = resources.data?.find(
    (resource) => resource.id === id && resource.kind === "server",
  );
  const deleting = !!server?.data.deleting;
  const status = useServerDeletionStatus(
    id,
    !!account?.admin && (deleting || (!resources.isPending && !server)),
  );
  const reviewMutation = useReviewServerDeletion();
  const confirmation = useConfirmServerDeletion(id);
  const retry = useRetryServerDeletion(id);
  const [state, dispatch] = useReducer(
    serverDeletionPageReducer,
    initialServerDeletionPageState,
  );
  const plan = reviewMutation.data ?? null;
  let failure = reviewMutation.error;
  if (state.action === "confirmation") failure = confirmation.error;
  if (state.action === "retry") failure = retry.error;
  const error = failure ? describeError(failure) : "";
  function setName(value: string) {
    dispatch({ type: "name_changed", value });
  }
  function setAck(value: boolean) {
    dispatch({ type: "ack_changed", value });
  }
  function setRepair(value: boolean) {
    dispatch({ type: "repair_changed", value });
  }
  function review() {
    if (reviewMutation.isPending) return;
    dispatch({ type: "review_started" });
    reviewMutation.reset();
    reviewMutation.mutate(id);
  }
  function submitConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || confirmation.isPending) return;
    const parsed = serverDeletionSchema(plan.serverName).safeParse({
      planId: plan.id,
      name: state.name,
      deleteVolumes: state.ack,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    dispatch({ type: "confirmation_started" });
    confirmation.mutate(parsed.data, {
      onError: (error) => {
        if (error.error.kind === "http" && error.error.status === 409) {
          reviewMutation.reset();
          dispatch({ type: "plan_expired" });
        }
      },
    });
  }
  function retryCleanup() {
    if (retry.isPending) return;
    dispatch({ type: "retry_started" });
    retry.mutate();
  }
  return {
    state,
    derived: {
      account,
      resources,
      server,
      deleting,
      status,
      plan,
      error,
      reviewing: reviewMutation.isPending,
      confirming: confirmation.isPending,
      retrying: retry.isPending,
    },
    handlers: {
      setName,
      setAck,
      setRepair,
      review,
      submitConfirmation,
      retryCleanup,
    },
  };
}
