interface ExportShareButtonProps {
  itineraryId: string
}

/**
 * Export / share control for an itinerary (FOUNDATION stub).
 *
 * Renders nothing for now; FE-FEATURES fills it in to call exportItinerary /
 * createShareLink from the API client.
 */
export default function ExportShareButton(props: ExportShareButtonProps): null {
  void props.itineraryId
  return null
}
