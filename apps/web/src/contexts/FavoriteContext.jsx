import React, { createContext, useContext, useCallback } from 'react';
import { useFavoritesQuery, useToggleFavoriteMutation } from '../hooks/useFavorites';

const FavoriteContext = createContext(null);

export function FavoriteProvider({ children }) {
  const { data: favorites = [], isFetched } = useFavoritesQuery();
  const toggleMutation = useToggleFavoriteMutation();

  const isFavorite = useCallback(
    (trackId) => favorites.some((f) => f.id === trackId),
    [favorites]
  );

  const toggleFavorite = useCallback((track) => {
    if (!track) return;
    const exists = favorites.some((f) => f.id === track.id);
    toggleMutation.mutate({ track, isAdding: !exists });
  }, [favorites, toggleMutation]);

  const removeFavorite = useCallback((trackId) => {
    const track = favorites.find(f => f.id === trackId);
    if (track) {
      toggleMutation.mutate({ track, isAdding: false });
    }
  }, [favorites, toggleMutation]);

  return (
    <FavoriteContext.Provider value={{ favorites, isFavorite, toggleFavorite, removeFavorite, isLoaded: isFetched }}>
      {children}
    </FavoriteContext.Provider>
  );
}

export function useFavorite() {
  return useContext(FavoriteContext);
}
