'use client'

import { BskyAgent } from '@atproto/api'
import { useQuery } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

import { OzoneConfig, getConfig } from '@/lib/client-config'
import { OZONE_SERVICE_DID } from '@/lib/constants'
import { useAuthDid, usePdsAgent } from './AuthContext'
export enum ConfigurationState {
  Unavailable,
  Pending,
  Ready,
  Unconfigured,
  Unauthorized,
}

export type ReconfigureOptions = {
  skipRecord?: boolean
}

export type ConfigurationContextData = {
  serviceDid?: string
  state: ConfigurationState
  config?: OzoneConfig
  error?: Error
  reconfigure: (options?: ReconfigureOptions) => void
  /** An agent to use in order to communicate with the labeler on the user's behalf. */
  labelerAgent?: BskyAgent
}

const ConfigurationContext = createContext<ConfigurationContextData | null>(
  null,
)

// {
//   serviceDid: OZONE_SERVICE_DID,
//   state: ConfigurationState.Unavailable,
//   reconfigure: () => {},
// }

export const ConfigurationProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const {
    data: config,
    error: configError,
    refetch: configRefetch,
  } = useQuery<OzoneConfig, Error>({
    queryKey: ['labeler-config'],
    queryFn: async () => getConfig(OZONE_SERVICE_DID),
  })
  const serviceDid = config ? config.did : OZONE_SERVICE_DID

  const [skipRecord, setSkipRecord] = useState(false)

  const pds = usePdsAgent()

  const labelerAgent: BskyAgent | undefined = useMemo(() => {
    if (!serviceDid) return undefined
    if (!pds) return undefined

    setSkipRecord(false)

    const [did, id = 'atproto_labeler'] = serviceDid.split('#')
    return pds.withProxy(id, did)
  }, [serviceDid, pds])

  const authDid = useAuthDid()
  const { data: state = ConfigurationState.Pending } =
    useQuery<ConfigurationState>({
      queryKey: ['labeler-config-state', { authDid, serviceDid }],
      queryFn: async () => {
        // User is not authenticated
        if (!authDid) return ConfigurationState.Unavailable

        // config is loading
        if (!config) return ConfigurationState.Pending
        if (!labelerAgent) return ConfigurationState.Pending

        try {
          await labelerAgent.api.tools.ozone.moderation.getRepo({
            did: authDid,
          })

          if (
            config.needs.key ||
            config.needs.service ||
            (!skipRecord && config.needs.record && config.did === authDid)
          ) {
            return ConfigurationState.Unconfigured
          }

          return ConfigurationState.Ready
        } catch (err) {
          if (err?.['status'] === 401) return ConfigurationState.Unauthorized
          throw err // retry
        }
      },
    })

  const stateError = useMemo(() => {
    if (state === ConfigurationState.Unauthorized) {
      return new Error(
        "Account does not have access to this Ozone service. If this seems in error, check Ozone's access configuration.",
      )
    }
    return undefined
  }, [state])

  const reconfigure = useCallback(
    (options?: ReconfigureOptions) => {
      if (options?.skipRecord != null) setSkipRecord(options.skipRecord)
      configRefetch()
    },
    [configRefetch],
  )

  const error = configError ?? stateError

  const configurationContextData: ConfigurationContextData = useMemo(
    () => ({ state, config, error, labelerAgent, reconfigure }),
    [state, config, error, labelerAgent, reconfigure],
  )

  return (
    <ConfigurationContext.Provider value={configurationContextData}>
      {children}
    </ConfigurationContext.Provider>
  )
}

export const useConfigurationContext = (): ConfigurationContextData => {
  const context = useContext(ConfigurationContext)
  if (!context) throw new Error(`a ConfigurationProvider is required`)
  return context
}

export function useLabelerAgent() {
  const { labelerAgent } = useConfigurationContext()
  return labelerAgent
}
