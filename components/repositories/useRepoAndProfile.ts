import { getDidFromHandle } from '@/lib/identity'
import { useLabelerAgent } from '@/shell/ConfigurationContext'
import { useQuery } from '@tanstack/react-query'

export const useRepoAndProfile = ({ id }: { id: string }) => {
  const labeler = useLabelerAgent()
  return useQuery({
    enabled: !!labeler,
    queryKey: ['accountView', { id, for: labeler?.did ?? null }],
    queryFn: async () => {
      const getRepo = async () => {
        let did
        if (id.startsWith('did:')) {
          did = id
        } else {
          did = await getDidFromHandle(id)
        }
        const { data: repo } =
          await labeler!.api.tools.ozone.moderation.getRepo({ did })
        return repo
      }
      const getProfile = async () => {
        try {
          const { data: profile } =
            await labeler!.api.app.bsky.actor.getProfile({ actor: id })
          return profile
        } catch (err) {
          if (err?.['error'] === 'AccountTakedown') {
            return undefined
          }
          throw err
        }
      }
      const [repo, profile] = await Promise.all([getRepo(), getProfile()])
      return { repo, profile }
    },
    staleTime: 5 * 60 * 1000,
  })
}
