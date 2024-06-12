import { useInfiniteQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { useTitle } from 'react-use'

import { RepositoriesTable } from '@/repositories/RepositoriesTable'
import { useLabelerAgent } from '@/shell/ConfigurationContext'
import { SectionHeader } from '../../components/SectionHeader'

export default function RepositoriesListPage() {
  const params = useSearchParams()
  const labeler = useLabelerAgent()

  const q = params.get('term') ?? ''
  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    enabled: !!labeler,
    queryKey: ['repositories', { q, for: labeler?.did ?? null }],
    queryFn: async ({ pageParam }) => {
      const { data } = await labeler!.api.tools.ozone.moderation.searchRepos({
        q,
        limit: 25,
        cursor: pageParam,
      })
      return data
    },
    getNextPageParam: (lastPage) => lastPage.cursor,
  })

  let pageTitle = `Repositories`
  if (q) {
    pageTitle += ` - ${q}`
  }

  useTitle(pageTitle)

  const repos = data?.pages.flatMap((page) => page.repos) ?? []
  return (
    <>
      <SectionHeader title="Repositories" tabs={[]} current="all" />

      <RepositoriesTable
        repos={repos}
        onLoadMore={fetchNextPage}
        showLoadMore={!!hasNextPage}
        showEmptySearch={!q?.length && !repos.length}
      />
    </>
  )
}
