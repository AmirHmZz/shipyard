import { useMutation } from "@tanstack/react-query";
import { reviewServerDeletion } from "../services";

export function useReviewServerDeletion() {
  return useMutation({ mutationFn: reviewServerDeletion });
}
