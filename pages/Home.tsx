import React, { useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import { useAppContext } from '../context/AppContext';
import { fetchFeaturedSongs } from '../services/dataService';
import { Song } from '../types';
import Header from '../components/Header';
import { Play, Pause, SkipBack, SkipForward, BadgeCheck, Loader2 } from 'lucide-react';

const Home: React.FC = () => {
  const { currentSong, setCurrentSong, isPlaying, setIsPlaying } = useAppContext();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  // Cast ReactPlayer to any to bypass incorrect type definitions in strict mode
  const Player = ReactPlayer as any;

  useEffect(() => {
    const loadSongs = async () => {
      try {
        const data = await fetchFeaturedSongs();
        setSongs(data);
        // Only set initial song if none is selected
        if (!currentSong && data.length > 0) {
          setCurrentSong(data[0]);
        }
      } catch (error) {
        console.error("Failed to load music:", error);
      } finally {
        setLoading(false);
      }
    };
    loadSongs();
  }, []);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (!currentSong) return;
    const currentIndex = songs.findIndex(s => s.id === currentSong.id);
    const nextIndex = (currentIndex + 1) % songs.length;
    setCurrentSong(songs[nextIndex]);
    setIsPlaying(true);
  };

  const handlePrev = () => {
    if (!currentSong) return;
    const currentIndex = songs.findIndex(s => s.id === currentSong.id);
    const prevIndex = (currentIndex - 1 + songs.length) % songs.length;
    setCurrentSong(songs[prevIndex]);
    setIsPlaying(true);
  };

  if (loading) {
    return (
      <div className="pt-20 min-h-screen bg-gray-100 flex justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="pt-16 pb-20 min-h-screen bg-gray-100 flex flex-col items-center">
      <Header title="Zimbabwe Music Hub" />
      
      {/* 
        Youtube Player Logic:
        We keep this mounted but hidden to maintain audio state while navigating tabs.
        The 'controls' are hidden to enforce our Custom UI.
      */}
      {currentSong && (
        <div className="hidden">
          <Player
            url={`https://www.youtube.com/watch?v=${currentSong.youtubeId}`}
            playing={isPlaying}
            width="100%"
            height="100%"
            controls={false}
            onEnded={handleNext}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            config={{
              youtube: {
                playerVars: { 
                  showinfo: 0, 
                  autoplay: isPlaying ? 1 : 0,
                  playsinline: 1 // Crucial for mobile
                }
              } as any
            }}
          />
        </div>
      )}

      {/* Main Player Card */}
      <div className="w-full max-w-sm px-6 mt-6 flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-[2rem] shadow-xl p-6 flex flex-col items-center relative overflow-hidden">
          
          {/* Background Blur Effect (Optional polish) */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-secondary"></div>

          {/* Album Art */}
          <div className="w-64 h-64 bg-gray-900 rounded-2xl overflow-hidden shadow-lg mb-8 relative group">
             {currentSong ? (
               <img 
                 src={currentSong.coverUrl} 
                 alt={currentSong.title} 
                 className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
               />
             ) : (
               <div className="flex items-center justify-center h-full text-gray-500">No Song Selected</div>
             )}
          </div>

          {/* Song Info */}
          <div className="text-center mb-8 w-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-2 truncate px-2">
              {currentSong?.title || "Select a Song"}
            </h2>
            <div className="flex items-center justify-center gap-1 text-primary font-medium bg-blue-50 py-1 px-3 rounded-full mx-auto w-max">
              <span>{currentSong?.artist || "Artist"}</span>
              <BadgeCheck size={16} fill="currentColor" className="text-blue-500" />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between w-full px-6 mb-4">
            <button onClick={handlePrev} className="text-gray-400 hover:text-primary transition-colors p-2">
              <SkipBack size={32} fill="currentColor" />
            </button>
            
            <button 
              onClick={handlePlayPause}
              className="w-20 h-20 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-500/40 hover:scale-105 active:scale-95 transition-all"
            >
              {isPlaying ? (
                <Pause size={36} fill="currentColor" />
              ) : (
                <Play size={36} fill="currentColor" className="ml-1" />
              )}
            </button>
            
            <button onClick={handleNext} className="text-gray-400 hover:text-primary transition-colors p-2">
              <SkipForward size={32} fill="currentColor" />
            </button>
          </div>
          
          {/* Metadata */}
          <div className="mt-4 text-xs text-gray-400 uppercase tracking-widest">
            Licensed Playback
          </div>

        </div>
      </div>
      
      {/* Playlist Preview (Mini) */}
      <div className="w-full max-w-sm px-6 mt-8">
        <h3 className="text-sm font-bold text-gray-500 mb-3 px-1 uppercase tracking-wider">Up Next</h3>
        <div className="space-y-3">
          {songs.map((song) => (
            <div 
              key={song.id} 
              onClick={() => { setCurrentSong(song); setIsPlaying(true); }}
              className={`flex items-center p-3 rounded-xl cursor-pointer transition-colors ${
                currentSong?.id === song.id ? 'bg-white shadow-md border-l-4 border-primary' : 'bg-white/50 hover:bg-white'
              }`}
            >
              <img src={song.coverUrl} alt="mini cover" className="w-10 h-10 rounded-lg object-cover bg-gray-200" />
              <div className="ml-3 flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${currentSong?.id === song.id ? 'text-primary' : 'text-gray-800'}`}>
                  {song.title}
                </p>
                <p className="text-xs text-gray-500 truncate">{song.artist}</p>
              </div>
              {currentSong?.id === song.id && isPlaying && (
                 <div className="flex space-x-0.5 h-3 items-end">
                    <div className="w-1 bg-primary animate-[bounce_1s_infinite] h-full"></div>
                    <div className="w-1 bg-primary animate-[bounce_1.2s_infinite] h-2/3"></div>
                    <div className="w-1 bg-primary animate-[bounce_0.8s_infinite] h-full"></div>
                 </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default Home;