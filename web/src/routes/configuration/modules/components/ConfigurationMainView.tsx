import {
  ConfigurationGuard,
  ConfigurationPage,
} from "@/components/ConfigurationSurface";

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
