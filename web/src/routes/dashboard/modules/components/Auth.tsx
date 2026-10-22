import { useAuthForm } from "../hooks";
import { AuthBrand } from "./AuthBrand";
import { AuthForm } from "./AuthForm";
export function Auth() {
  const controller = useAuthForm();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <AuthBrand />
      <div className="flex items-center justify-center p-6 sm:p-12">
        <AuthForm controller={controller} />
      </div>
    </div>
  );
}
