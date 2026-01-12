import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { Heart, MessageCircle, DollarSign, Calendar, Music, Megaphone, Send, Loader2, AlertCircle, X, ShieldCheck, Shield, Check, Clock, ChevronRight, UserPlus, UserCheck } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { fetchSocialFeed, publishPost, fetchComments, postComment, likePost, getVerificationStatus, submitVerificationRequest, toggleFollowArtist, verifyTransaction } from '../services/dataService';
import { Post, PostType, Comment, VerificationStatus } from '../types';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { useRateLimit } from '../hooks/useRateLimit';
import { useTransactionStatus } from '../hooks/useTransactionStatus';
import { useTelegram } from '../hooks/useTelegram';
import { analytics } from '../services/analyticsService';

const MIN_COMMENT_LENGTH = 3;

const ArtistDashboard: React.FC = () => {
  const { role, viewMode, setViewMode, telegramUser, isIdentityLoading, walletAddress } = useAppContext();
  const [tonConnectUI] = useTonConnectUI();
  const { checkLimit, rateLimitError, clearRateLimitError } = useRateLimit();
  const { showAlert, haptic } = useTelegram(); 
  
  const { status: txStatus, handleTransaction, resetStatus } = useTransactionStatus();
  const [tippingPostId, setTippingPostId] = useState<string | null>(null);

  // Feed State
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Post Creation State
  const [newPostContent, setNewPostContent] = useState('');
  const [postType, setPostType] = useState<PostType>('news');
  const [isPosting, setIsPosting] = useState(false);

  // Comments State
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<Record<string, Comment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const [commentDraft, setCommentDraft] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Verification State
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyForm, setApplyForm] = useState({ bio: '', genre: '', socialLink: '' });
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (role !== 'artist' && viewMode === 'artist') {
      setViewMode('user');
    }
  }, [role, viewMode, setViewMode]);

  useEffect(() => {
    loadFeed();
  }, [viewMode, role]);

  useEffect(() => {
    // Check verification status if user is not an artist
    if (role === 'user' && !isIdentityLoading) {
        checkStatus();
    }
  }, [role, isIdentityLoading]);

  const checkStatus = async () => {
      try {
          const result = await getVerificationStatus();
          setVerificationStatus(result.status);
      } catch (e) {
          console.warn("Status check failed", e);
      }
  };

  const loadFeed = async () => {
    setIsLoading(true);
    try {
      const data = await fetchSocialFeed(viewMode, String(telegramUser?.id));
      setPosts(data);
    } catch (e) {
      console.warn("Feed load failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplySubmit = async () => {
    if (!applyForm.bio || !applyForm.genre || !applyForm.socialLink) {
        showAlert("Please fill in all fields.");
        return;
    }
    
    setIsApplying(true);
    try {
        await submitVerificationRequest(applyForm);
        setVerificationStatus('pending');
        setShowApplyForm(false);
        analytics.track('artist_application_submit', { genre: applyForm.genre });
        showAlert("Application submitted successfully!");
    } catch (e) {
        showAlert("Failed to submit application. Try again.");
    } finally {
        setIsApplying(false);
    }
  };

  const handlePublish = async () => {
    if (!newPostContent.trim()) return;
    if (!checkLimit('post')) return;

    setIsPosting(true);
    const artistIdentity = {
        id: 'artist_current',
        name: telegramUser?.first_name || 'Unknown Artist'
    };

    try {
        const post = await publishPost(newPostContent, postType, artistIdentity);
        setPosts([post, ...posts]);
        setNewPostContent('');
        analytics.track('post_publish', { type: postType });
    } catch (e) {
        console.warn("Publish failed:", e);
        showAlert("Failed to publish post.");
    } finally {
        setIsPosting(false);
    }
  };

  const handleLike = async (postId: string) => {
    if (!telegramUser) return;
    if (!checkLimit('like')) return;
    
    haptic('light');

    setPosts(currentPosts => 
      currentPosts.map(p => {
        if (p.id === postId) {
            const isLiked = !p.isLikedByMe;
            if (isLiked) analytics.track('post_like', { postId, artistId: p.artistId });
            return {
                ...p,
                isLikedByMe: isLiked,
                likes: isLiked ? p.likes + 1 : Math.max(0, p.likes - 1)
            };
        }
        return p;
      })
    );

    try {
        await likePost(postId, telegramUser.id.toString());
    } catch (e) {
        console.warn("Like failed:", e);
        loadFeed(); 
    }
  };

  const handleFollow = async (artistId: string, currentStatus: boolean | undefined) => {
      const shouldFollow = !currentStatus;
      haptic('medium');

      setPosts(currentPosts => 
          currentPosts.map(p => 
              p.artistId === artistId ? { ...p, isFollowedByMe: shouldFollow } : p
          )
      );

      if (shouldFollow) analytics.track('artist_follow', { artistId });

      try {
          await toggleFollowArtist(artistId, shouldFollow);
      } catch (e) {
          setPosts(currentPosts => 
            currentPosts.map(p => 
                p.artistId === artistId ? { ...p, isFollowedByMe: !shouldFollow } : p
            )
        );
        showAlert("Could not update follow status.");
      }
  };

  const handleTip = async (artistWallet: string, postId: string) => {
    if (!walletAddress) {
        showAlert("Please connect your wallet first!");
        analytics.track('tip_attempt_no_wallet', { postId });
        return;
    }
    if (!checkLimit('tip')) return;

    setTippingPostId(postId);
    resetStatus();

    analytics.track('tip_initiated', { postId });

    const amount = "100000000"; // 0.1 TON
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
            {
                address: artistWallet,
                amount: amount,
                payload: `Tip for post ${postId}` 
            }
        ]
    };

    try {
        // Step 8: Transaction with backend verification
        const txHash = await handleTransaction(walletAddress, async () => {
            await tonConnectUI.sendTransaction(transaction);
        });

        // Backend Verification
        await verifyTransaction(txHash, 'tip', { postId, artistWallet });
        
        showAlert("Tip confirmed! The artist thanks you.");
        analytics.track('tip_success', { postId, txHash });
    } catch (e: any) {
        const msg = (typeof e === 'string' ? e : e?.message || '').toLowerCase();
        if (!msg.includes('cancelled') && !msg.includes('rejected')) {
            showAlert("Transaction failed. Please try again.");
            analytics.track('tip_failed', { postId, error: msg });
        } else {
            analytics.track('tip_cancelled', { postId });
        }
    } finally {
        if (txStatus === 'idle') setTippingPostId(null);
    }
  };

  const toggleComments = async (postId: string) => {
    if (expandedPostId === postId) {
        setExpandedPostId(null);
        setCommentDraft('');
        setActionError(null);
        clearRateLimitError();
        return;
    }
    setExpandedPostId(postId);
    setActionError(null);
    clearRateLimitError();
    analytics.track('comments_expand', { postId });
    
    if (!postComments[postId]) {
        setCommentsLoading(prev => ({ ...prev, [postId]: true }));
        try {
            const comments = await fetchComments(postId);
            setPostComments(prev => ({ ...prev, [postId]: comments }));
        } catch (e: any) {
            setActionError("Could not load comments.");
        } finally {
            setCommentsLoading(prev => ({ ...prev, [postId]: false }));
        }
    }
  };

  const handleSubmitComment = async (postId: string) => {
    if (!commentDraft.trim() || !telegramUser) return;
    if (commentDraft.length < MIN_COMMENT_LENGTH) {
        setActionError(`Comment too short (min ${MIN_COMMENT_LENGTH} chars)`);
        return;
    }
    if (!checkLimit('comment')) return;

    setIsSubmittingComment(true);
    setActionError(null);

    try {
        const newComment = await postComment(postId, commentDraft, telegramUser, role);
        setPostComments(prev => ({
            ...prev,
            [postId]: [...(prev[postId] || []), newComment]
        }));
        setCommentDraft('');
        analytics.track('comment_submit', { postId });
    } catch (e: any) {
        setActionError(e.message || "Failed to post comment.");
    } finally {
        setIsSubmittingComment(false);
    }
  };

  const getTypeIcon = (type: PostType) => {
    switch (type) {
        case 'show': return <Calendar size={14} className="text-purple-500" />;
        case 'release': return <Music size={14} className="text-blue-500" />;
        default: return <Megaphone size={14} className="text-orange-500" />;
    }
  };

  const getTypeLabel = (type: PostType) => {
    switch (type) {
        case 'show': return 'Upcoming Show';
        case 'release': return 'New Release';
        default: return 'Artist Update';
    }
  };

  return (
    <div className="pt-16 pb-20 min-h-screen bg-background flex flex-col items-center">
      <Header title="Profile" />

      {/* Global Rate Limit Toast */}
      {rateLimitError && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-2 rounded-full shadow-lg text-xs font-bold animate-in fade-in slide-in-from-top-2 flex items-center gap-2">
            <AlertCircle size={14} />
            {rateLimitError}
        </div>
      )}

      <div className="w-full max-w-sm px-4 mt-4 space-y-4">
        
        {/* Identity & Verification Card */}
        <div className="bg-surface rounded-xl p-4 shadow-sm border border-gray-100/10">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className={`w-10 h-10 rounded-full flex items-center justify-center ${role === 'artist' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    {isIdentityLoading ? <Loader2 size={20} className="animate-spin"/> : role === 'artist' ? <ShieldCheck size={20}/> : <Shield size={20} />}
                 </div>
                 <div>
                    <h3 className="text-sm font-bold text-text">
                        {isIdentityLoading ? 'Verifying...' : role === 'artist' ? 'Verified Artist' : 'Fan Account'}
                    </h3>
                    <p className="text-[10px] text-hint">
                        {isIdentityLoading ? 'Checking blockchain records' : role === 'artist' ? 'Creator privileges active' : 'Standard access'}
                    </p>
                 </div>
              </div>
              
              {/* Wallet Prompt if disconnected */}
              {!walletAddress && role !== 'artist' && !isIdentityLoading && (
                 <div className="flex items-center text-[10px] text-orange-500 gap-1 bg-orange-50 px-2 py-1 rounded-md">
                    <AlertCircle size={12} />
                    <span>Connect</span>
                 </div>
              )}
           </div>

           {/* Artist Application Entry Point */}
           {role === 'user' && !isIdentityLoading && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                    {verificationStatus === 'idle' && (
                        <div onClick={() => setShowApplyForm(!showApplyForm)} className="flex items-center justify-between cursor-pointer group">
                             <span className="text-xs font-bold text-primary">Become a Creator</span>
                             <div className="flex items-center gap-1 text-[10px] text-hint group-hover:text-primary transition-colors">
                                 <span>Apply for access</span>
                                 <ChevronRight size={12} />
                             </div>
                        </div>
                    )}
                    {verificationStatus === 'pending' && (
                        <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded-lg">
                            <Clock size={14} />
                            <span className="font-medium">Application Under Review</span>
                        </div>
                    )}
                    {verificationStatus === 'rejected' && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded-lg">
                            <AlertCircle size={14} />
                            <span className="font-medium">Application Rejected</span>
                        </div>
                    )}
                </div>
           )}
        </div>

        {/* Application Form */}
        {showApplyForm && role === 'user' && verificationStatus === 'idle' && (
            <div className="bg-surface rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-text">Artist Application</h3>
                    <button onClick={() => setShowApplyForm(false)}><X size={16} className="text-hint"/></button>
                </div>
                
                <div className="space-y-3">
                    <input 
                        className="w-full text-xs bg-background border border-gray-200 rounded-lg p-3 text-text focus:border-primary focus:outline-none"
                        placeholder="Artist Name / Stage Name"
                        value={applyForm.bio} // Reusing bio field for Name for simplicity in this demo, in real app add 'name'
                        onChange={e => setApplyForm({...applyForm, bio: e.target.value})}
                    />
                    <input 
                        className="w-full text-xs bg-background border border-gray-200 rounded-lg p-3 text-text focus:border-primary focus:outline-none"
                        placeholder="Genre (e.g. Zimdancehall, Afro-Beats)"
                        value={applyForm.genre}
                        onChange={e => setApplyForm({...applyForm, genre: e.target.value})}
                    />
                    <input 
                        className="w-full text-xs bg-background border border-gray-200 rounded-lg p-3 text-text focus:border-primary focus:outline-none"
                        placeholder="Link to your music (YouTube/Spotify)"
                        value={applyForm.socialLink}
                        onChange={e => setApplyForm({...applyForm, socialLink: e.target.value})}
                    />
                    
                    <button 
                        onClick={handleApplySubmit}
                        disabled={isApplying}
                        className="w-full bg-primary text-white py-2 rounded-lg text-xs font-bold hover:bg-secondary disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                        {isApplying ? <Loader2 size={14} className="animate-spin"/> : "Submit Application"}
                    </button>
                    <p className="text-[10px] text-hint text-center">Requires manual approval by admin.</p>
                </div>
            </div>
        )}

        {/* Artist View Toggle */}
        {role === 'artist' && !isIdentityLoading && (
            <div className="bg-surface rounded-xl p-1 flex shadow-sm mb-4">
                <button 
                    onClick={() => setViewMode('user')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'user' ? 'bg-gray-100 text-gray-800 shadow-inner' : 'text-hint'}`}
                >
                    View as Fan
                </button>
                <button 
                    onClick={() => setViewMode('artist')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${viewMode === 'artist' ? 'bg-primary text-white shadow-md' : 'text-hint'}`}
                >
                    Creator Studio
                </button>
            </div>
        )}

        <div className="px-2">
            <h2 className="font-bold text-text text-lg">
                {viewMode === 'artist' ? 'Your Dashboard' : 'Community Feed'}
            </h2>
            {viewMode === 'user' && <span className="text-xs text-hint">Updates from artists you follow</span>}
        </div>
        
        {/* Artist Post Creation */}
        {viewMode === 'artist' && role === 'artist' && (
          <div className="bg-surface rounded-2xl shadow-sm p-4 animate-in fade-in slide-in-from-top-4">
            <h3 className="text-sm font-bold text-text mb-3">Post Update</h3>
            <textarea
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                placeholder="Share news, shows, or thoughts..."
                className="w-full bg-background border border-gray-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 mb-3 resize-none h-24 text-text"
            />
            <div className="flex justify-between items-center">
                <div className="flex space-x-2">
                    <button onClick={() => setPostType('news')} className={`p-2 rounded-lg transition-colors ${postType === 'news' ? 'bg-orange-100 text-orange-600' : 'bg-background text-hint'}`}><Megaphone size={18} /></button>
                    <button onClick={() => setPostType('show')} className={`p-2 rounded-lg transition-colors ${postType === 'show' ? 'bg-purple-100 text-purple-600' : 'bg-background text-hint'}`}><Calendar size={18} /></button>
                    <button onClick={() => setPostType('release')} className={`p-2 rounded-lg transition-colors ${postType === 'release' ? 'bg-blue-100 text-blue-600' : 'bg-background text-hint'}`}><Music size={18} /></button>
                </div>
                <button 
                    onClick={handlePublish}
                    disabled={!newPostContent.trim() || isPosting}
                    className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-secondary disabled:opacity-50"
                >
                    {isPosting ? '...' : 'Post'}
                    <Send size={16} />
                </button>
            </div>
          </div>
        )}

        {/* FEED */}
        <div className="space-y-4">
            {isLoading ? (
                <div className="text-center py-10 text-hint">Loading updates...</div>
            ) : posts.length === 0 ? (
                <div className="text-center py-10 text-hint text-sm">No updates yet.</div>
            ) : posts.map((post) => (
                <div key={post.id} className="bg-surface rounded-2xl shadow-sm p-5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center text-gray-600 font-bold">
                                {post.artistName[0]}
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-text leading-tight">{post.artistName}</h4>
                                <span className="text-[10px] text-hint">{new Date(post.timestamp).toLocaleDateString()}</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            {/* Follow Button - Only visible for users viewing others */}
                            {viewMode === 'user' && (
                                <button 
                                    onClick={() => handleFollow(post.artistId, post.isFollowedByMe)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${
                                        post.isFollowedByMe 
                                        ? 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500' 
                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                    }`}
                                >
                                    {post.isFollowedByMe ? (
                                        <>
                                            <UserCheck size={12} />
                                            <span>Following</span>
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus size={12} />
                                            <span>Follow</span>
                                        </>
                                    )}
                                </button>
                            )}

                            <div className="flex items-center gap-1 bg-background px-2 py-1 rounded-md">
                                {getTypeIcon(post.type)}
                                <span className="text-[10px] font-medium uppercase tracking-wide text-hint">{getTypeLabel(post.type)}</span>
                            </div>
                        </div>
                    </div>

                    <p className="text-text text-sm leading-relaxed mb-4">{post.content}</p>

                    <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                        <div className="flex space-x-4">
                            <button 
                                onClick={() => handleLike(post.id)}
                                className="flex items-center gap-1 text-hint hover:text-red-500 transition-colors"
                            >
                                <Heart size={18} className={post.isLikedByMe ? "fill-red-500 text-red-500" : ""} />
                                <span className="text-xs font-medium">{post.likes}</span>
                            </button>
                            <button 
                                onClick={() => toggleComments(post.id)}
                                className={`flex items-center gap-1 transition-colors ${expandedPostId === post.id ? 'text-blue-500' : 'text-hint hover:text-blue-500'}`}
                            >
                                <MessageCircle size={18} />
                                <span className="text-xs font-medium">{post.comments + (postComments[post.id]?.length || 0)}</span>
                            </button>
                        </div>
                        
                        {viewMode === 'user' && (
                            <button 
                                onClick={() => handleTip(post.artistWallet, post.id)}
                                disabled={tippingPostId !== null && tippingPostId !== post.id}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all active:scale-95 ${
                                    tippingPostId === post.id
                                    ? txStatus === 'success' 
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-blue-100 text-blue-700'
                                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                                }`}
                            >
                                {tippingPostId === post.id ? (
                                    <>
                                        {txStatus === 'pending_wallet' && <><Loader2 size={14} className="animate-spin"/><span className="text-xs font-bold">Sign...</span></>}
                                        {txStatus === 'pending_chain' && <><Loader2 size={14} className="animate-spin"/><span className="text-xs font-bold">Sending...</span></>}
                                        {txStatus === 'success' && <><Check size={14}/><span className="text-xs font-bold">Sent!</span></>}
                                        {txStatus === 'error' && <><X size={14}/><span className="text-xs font-bold">Retry</span></>}
                                    </>
                                ) : (
                                    <>
                                        <DollarSign size={14} />
                                        <span className="text-xs font-bold">Tip 0.1 TON</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {expandedPostId === post.id && (
                        <div className="mt-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-1">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-bold text-hint uppercase tracking-wide">Comments</h4>
                                <button onClick={() => toggleComments(post.id)} className="text-hint hover:text-text"><X size={14} /></button>
                            </div>

                            {actionError && (
                                <div className="bg-red-50 text-red-600 text-xs p-2 rounded-lg mb-3 flex items-center gap-2">
                                    <AlertCircle size={14} />
                                    {actionError}
                                </div>
                            )}

                            <div className="space-y-3 mb-4 max-h-40 overflow-y-auto">
                                {commentsLoading[post.id] ? (
                                    <div className="flex justify-center py-4"><Loader2 className="animate-spin text-hint" size={16}/></div>
                                ) : (postComments[post.id]?.length === 0 || !postComments[post.id]) ? (
                                    <p className="text-xs text-hint text-center italic">No comments yet.</p>
                                ) : (
                                    postComments[post.id]?.map((comment) => (
                                        <div key={comment.id} className="bg-background rounded-lg p-2">
                                            <div className="flex items-baseline justify-between mb-1">
                                                <span className="text-xs font-bold text-text">{comment.userName}</span>
                                                <span className="text-[10px] text-hint">{new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            </div>
                                            <p className="text-xs text-text">{comment.content}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex gap-2 items-center">
                                <input 
                                    type="text" 
                                    value={commentDraft}
                                    onChange={(e) => {
                                        setCommentDraft(e.target.value);
                                        if(actionError) setActionError(null);
                                    }}
                                    placeholder="Add a comment..." 
                                    className={`flex-1 bg-background border rounded-full px-3 py-2 text-xs focus:outline-none transition-colors text-text ${commentDraft.length > 0 && commentDraft.length < MIN_COMMENT_LENGTH ? 'border-red-300' : 'border-gray-200 focus:border-primary'}`}
                                    disabled={isSubmittingComment}
                                />
                                <button 
                                    onClick={() => handleSubmitComment(post.id)}
                                    disabled={!commentDraft.trim() || isSubmittingComment || commentDraft.length < MIN_COMMENT_LENGTH}
                                    className="bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 disabled:opacity-50 transition-colors flex-shrink-0"
                                >
                                    {isSubmittingComment ? <Loader2 size={14} className="animate-spin"/> : <Send size={14} />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default ArtistDashboard;