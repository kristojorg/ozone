import { ComAtprotoLabelDefs } from '@atproto/api'
import { useQuery } from '@tanstack/react-query'

import { usePdsAgent } from '@/shell/AuthContext'
import { ExtendedLabelerServiceDef } from './util'

export const useLabelerServiceDef = (did: string) => {
  const pds = usePdsAgent()

  const { data: labelerDef } = useQuery({
    enabled: !!pds,
    queryKey: ['labelerDef', { did }],
    queryFn: async () => {
      const { data } = await pds!.api.app.bsky.labeler.getServices({
        dids: [did],
        detailed: true,
      })
      if (!data.views?.[0]) {
        return null
      }

      const labelerDef = data.views[0] as ExtendedLabelerServiceDef
      if (labelerDef?.policies.labelValueDefinitions) {
        const definitionsById: Record<
          string,
          ComAtprotoLabelDefs.LabelValueDefinition
        > = {}
        labelerDef.policies.labelValueDefinitions.forEach((def) => {
          definitionsById[def.identifier] = def
        })
        labelerDef.policies.definitionById = definitionsById
      }

      return labelerDef
    },
    // These are not super likely to change frequently but labels will be rendered quite a lot
    // so caching them for longer period is ideal
    staleTime: 60 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
  })

  return labelerDef || null
}
