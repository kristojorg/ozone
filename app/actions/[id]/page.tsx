'use client'

import { Loading, LoadingFailed } from '@/common/Loader'
import { EventView } from '@/mod-event/View'
import { useLabelerAgent } from '@/shell/ConfigurationContext'
import { useQuery } from '@tanstack/react-query'

export default function Action({ params }: { params: { id: string } }) {
  const labeler = useLabelerAgent()
  const id = decodeURIComponent(params.id)

  const { data: action, error } = useQuery({
    enabled: !!labeler,
    queryKey: ['action', { id, for: labeler?.did ?? null }],
    queryFn: async () => {
      const { data } = await labeler!.api.tools.ozone.moderation.getEvent({
        id: parseInt(id, 10),
      })
      return data
    },
  })
  if (error) {
    return <LoadingFailed error={error} />
  }
  if (!action) {
    return <Loading />
  }
  return <EventView event={action} />
}
