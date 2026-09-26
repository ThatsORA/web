// Owner: Andy — hosts the favorites step.
import { FavoritesStep } from "../../features/favorites";
import { useOnboardingNav } from "../../lib/useOnboardingNav";

export default function Favorites() {
  const onDone = useOnboardingNav("favorites");
  return <FavoritesStep onDone={onDone} />;
}
