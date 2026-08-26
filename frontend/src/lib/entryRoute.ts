export function resolveEntryRouteRedirect(params: {
  loading: boolean
  hasUser: boolean
  selectedCityId: number | null | undefined
  route: 'shop' | 'city_select'
}) {
  const { loading, hasUser, selectedCityId, route } = params
  if (loading || !hasUser) {
    return null
  }

  if (route === 'city_select' && selectedCityId != null) {
    return '/shop'
  }

  return null
}
