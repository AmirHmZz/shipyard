import {
  ConfigurationGuard,
  ConfigurationPage,
} from "@/components/configuration-surface";
import { ConfigurationBody } from "./ConfigurationBody";

export function ConfigurationMainView() {
  return (
    <ConfigurationPage>
      <ConfigurationGuard>
        <ConfigurationBody />
      </ConfigurationGuard>
    </ConfigurationPage>
  );
}
