type ProviderLike = { providerId: string; email?: string | null }

export type AuthMethodEmails = {
  passwordEmail: string | null
  googleEmail: string | null
}

export function getAuthMethodEmails(providerData: ProviderLike[]): AuthMethodEmails {
  return {
    passwordEmail: providerData.find((item) => item.providerId === 'password')?.email ?? null,
    googleEmail: providerData.find((item) => item.providerId === 'google.com')?.email ?? null,
  }
}
