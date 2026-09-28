import { sign } from "@electron/osx-sign";

// Без сертификата electron-builder не подписывает macOS-сборку вовсе, и бандл остаётся
// со стоковой linker-подписью Electron, которая не покрывает ресурсы и Info.plist.
// macOS не может сверить такое приложение с выданными разрешениями, поэтому TCC
// спрашивает доступ к папкам снова и снова. Ad-hoc подпись всего бандла даёт валидную
// подпись с устойчивым cdhash. Именованный сертификат в T3CODE_DESKTOP_LOCAL_SIGN_IDENTITY
// (например, самоподписанный из «Связки ключей») даёт идентичность, которая переживает
// пересборки, и разрешения сохраняются между версиями.
export default async function signMacosLocal(context: {
  readonly electronPlatformName: string;
  readonly appOutDir: string;
  readonly packager: { readonly appInfo: { readonly productFilename: string } };
}): Promise<void> {
  if (context.electronPlatformName !== "darwin") {
    return;
  }
  await sign({
    app: `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`,
    identity: process.env.T3CODE_DESKTOP_LOCAL_SIGN_IDENTITY ?? "-",
    identityValidation: false,
    // Hardened runtime здесь не нужен: локальная сборка должна вести себя как неподписанная.
    optionsForFile: () => ({ hardenedRuntime: false }),
    batchCodesignCalls: true,
  });
}
