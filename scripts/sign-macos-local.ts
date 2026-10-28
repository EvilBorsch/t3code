import { sign } from "@electron/osx-sign";

// Без сертификата бандл остаётся со стоковой linker-подписью Electron, и TCC снова и снова
// спрашивает доступ к папкам. Ad-hoc подпись всего бандла это чинит; самоподписанный
// сертификат в T3CODE_DESKTOP_LOCAL_SIGN_IDENTITY сохраняет разрешения между пересборками.
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
