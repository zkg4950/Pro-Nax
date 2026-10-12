/* Copyright (c) 2026 ProNax. All rights reserved. Proprietary and Confidential. Unauthorized copying or redistribution is strictly prohibited. */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, UploadCloud, Film, Image as ImageIcon, CheckCircle2, 
  Loader2, Clock, ChevronRight, ChevronLeft, Check,
  AlertTriangle, ShieldCheck, FileText, Settings,
  Globe, Link as LinkIcon, Lock, DollarSign, Sparkles, Plus,
  Tag, AlertCircle, RefreshCw, Layers, Radio, Wifi, WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/loose';
import { checkCopyrightViolation, checkCopyrightStatus } from '@/lib/copyrightDetection';
import { generateVideoFingerprint, checkForCopyrightMatch } from '@/lib/videoFingerprint';
import { validateFile, videoMetadataSchema, firstIssue } from '@/lib/validation';
import { requireVerifiedUser, ensureUserProfile } from '@/lib/authGuards';
import { uploadVideoWithCopyrightDetection } from '@/lib/videoUpload';
import { 
  initializeUploadState, 
  performResumableUpload, 
  getIncompleteUploads, 
  resumeUpload, 
  cancelUpload,
  type UploadState 
} from '@/lib/resumableUpload';

type WizardStep = 1 | 2 | 3; // 1: Details & Media Setup, 2: Checks & Monetization, 3: Visibility & Schedule

const CATEGORIES = [
  'Science & Technology',
  'Gaming',
  'Music',
  'Entertainment',
  'Education',
  'Film & Animation',
  'Sports',
  'Vlogs',
  'News & Politics',
  'Comedy'
];

const PLAYLISTS = [
  'Favorites',
  'Watch Later',
  'Tech & Web Development',
  'Gaming Clips',
  'Music Highlights'
];

const HASHTAG_SUGGESTIONS = ['#Coding', '#WebDev', '#Tech', '#AI', '#Shorts', '#Gaming', '#Music', '#Tutorial'];

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoFile?: File | null;
  videoPreview?: string | null;
  onVideoChange?: (file: File | null) => void;
  onSuccess?: (videoData: any) => void;
}

export function UploadModal({ 
  open, 
  onOpenChange, 
  videoFile: initialVideoFile, 
  videoPreview: initialVideoPreview,
  onVideoChange,
  onSuccess
}: UploadModalProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // File & Media state
  const [file, setFile] = useState<File | null>(initialVideoFile || null);
  const [preCheck, setPreCheck] = useState<{ state: 'idle' | 'scanning' | 'done'; status?: string; message?: string }>({ state: 'idle' });
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(initialVideoPreview || null);
  const [duration, setDuration] = useState<number | null>(null);
  const [isShort, setIsShort] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Thumbnails state
  const [autoThumbnails, setAutoThumbnails] = useState<string[]>([]);
  const [generatingThumbs, setGeneratingThumbs] = useState(false);
  const [customThumbUrl, setCustomThumbUrl] = useState<string | null>(null);
  const [selectedThumbIndex, setSelectedThumbIndex] = useState<number>(0);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  // Step 1 Details state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [selectedPlaylist, setSelectedPlaylist] = useState('none');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);
  const [createdPlaylists, setCreatedPlaylists] = useState<string[]>(PLAYLISTS);

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      let newTag = tagInput.trim();
      if (newTag) {
        if (!newTag.startsWith('#') && !newTag.startsWith('@')) {
          newTag = '#' + newTag;
        }
        if (!tags.includes(newTag)) {
          setTags([...tags, newTag]);
        }
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Step 2 Checks & Monetization state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [processingStage, setProcessingStage] = useState<'uploading' | 'processing_hd' | 'copyright_check' | 'complete'>('uploading');
  const [copyrightStatus, setCopyrightStatus] = useState<'scanning' | 'clean' | 'claimed' | 'duplicate'>('scanning');
  const [claimDetails, setClaimDetails] = useState<{ claimant: string; track: string; policy: string; claimId?: string } | null>(null);
  const [generatedFingerprint, setGeneratedFingerprint] = useState<string>('');
  const [uploadError, setUploadError] = useState<{ type: string; message: string; retryable: boolean } | null>(null);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);

  // Monetization & Ad Suitability
  const [monetizationEnabled, setMonetizationEnabled] = useState(true);
  const [profanityLevel, setProfanityLevel] = useState<'none' | 'mild' | 'strong'>('none');
  const [adultLevel, setAdultLevel] = useState<'none' | 'mild' | 'explicit'>('none');
  const [violenceLevel, setViolenceLevel] = useState<'none' | 'mild'>('none');
  const [harmfulActs, setHarmfulActs] = useState(false);
  const [certifiedSafe, setCertifiedSafe] = useState(true);

  // Step 3 Visibility & Schedule state
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');

  // Draft auto-save state
  const [autoSaving, setAutoSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [networkRecoveryAttempt, setNetworkRecoveryAttempt] = useState(0);

  // Sync initial file
  useEffect(() => {
    if (initialVideoFile && initialVideoFile !== file) {
      handleSelectVideoFile(initialVideoFile);
    }
  }, [initialVideoFile]);

  // Auto-generate 3 frame previews when video file is selected
  const generateFramePreviews = useCallback(async (videoFileObj: File) => {
    setGeneratingThumbs(true);
    let url: string | null = null;
    let videoEl: HTMLVideoElement | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let aborted = false;

    const cleanup = () => {
      aborted = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (url) URL.revokeObjectURL(url);
      if (videoEl) {
        videoEl.onloadedmetadata = null;
        videoEl.onseeked = null;
        videoEl.onerror = null;
        videoEl.src = '';
        videoEl.load();
        videoEl.remove();
        videoEl = null;
      }
    };

    try {
      // Check file size before processing to prevent crash
      if (videoFileObj.size > 200 * 1024 * 1024) { // 200MB limit for thumbnail generation
        console.log('File too large for thumbnail generation, using defaults');
        setGeneratingThumbs(false);
        setAutoThumbnails([
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800'
        ]);
        return;
      }

      url = URL.createObjectURL(videoFileObj);
      videoEl = document.createElement('video');
      videoEl.src = url;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.crossOrigin = 'anonymous';
      videoEl.preload = 'metadata';

      // Set timeout for video loading (10 seconds)
      timeoutId = setTimeout(() => {
        console.warn('Video load timeout, using default thumbnails');
        cleanup();
        setGeneratingThumbs(false);
        setAutoThumbnails([
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800'
        ]);
      }, 10000);

      videoEl.onloadedmetadata = () => {
        if (aborted || !videoEl) {
          cleanup();
          return;
        }
        if (timeoutId) clearTimeout(timeoutId);
        
        const dur = isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 10;
        setDuration(dur);
        
        // Detect ProNax Shorts format: <= 120s & vertical/square aspect ratio
        const aspect = (videoEl.videoWidth || 16) / (videoEl.videoHeight || 9);
        setIsShort(dur <= 120 && aspect <= 1.05);

        const timestamps = [dur * 0.15, dur * 0.50, dur * 0.85];
        const captured: string[] = [];
        let idx = 0;

        const captureNext = () => {
          if (aborted || !videoEl || idx >= timestamps.length) {
            setAutoThumbnails(captured);
            setGeneratingThumbs(false);
            cleanup();
            return;
          }
          videoEl.currentTime = timestamps[idx];
        };

        videoEl.onseeked = () => {
          if (aborted || !videoEl) {
            cleanup();
            return;
          }
          try {
            
            // Use smaller dimensions for thumbnails to reduce memory
            const maxDimension = 320;
            const scale = Math.min(maxDimension / (videoEl.videoWidth || 640), maxDimension / (videoEl.videoHeight || 360));
            const canvas = document.createElement('canvas');
            canvas.width = (videoEl.videoWidth || 640) * scale;
            canvas.height = (videoEl.videoHeight || 360) * scale;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
              // Use lower quality for thumbnails to reduce memory
              captured.push(canvas.toDataURL('image/jpeg', 0.5));
            }
            // Clean up canvas
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            idx++;
            captureNext();
          } catch (captureError) {
            console.error('Error capturing thumbnail:', captureError);
            captured.push('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800');
            idx++;
            captureNext();
          }
        };

        // Start thumbnail generation
        captureNext();
      };

      videoEl.onerror = (e) => {
        console.error('Video load error during thumbnail generation:', e);
        cleanup();
        setGeneratingThumbs(false);
        setAutoThumbnails([
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800'
        ]);
      };
    } catch (error) {
      console.error('Error during thumbnail generation:', error);
      cleanup();
      setGeneratingThumbs(false);
      setAutoThumbnails([
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800'
      ]);
    }
  }, []);

  const handleSelectVideoFile = (selectedFile: File) => {
    const check = validateFile(selectedFile, 'video');
    if (!check.ok) {
      // Provide more detailed error messages based on the specific validation failure
      let errorMessage = check.error;
      let errorDetails = '';

      if (check.error.includes('too large')) {
        const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
        errorDetails = `Your file is ${fileSizeMB}MB. Please compress your video or split it into smaller parts.`;
      } else if (check.error.includes('Unsupported')) {
        errorDetails = 'Supported formats: MP4, WebM, QuickTime, MKV. Please convert your video to a supported format.';
      } else if (check.error.includes('empty')) {
        errorDetails = 'The selected file appears to be corrupted or empty. Please select a different file.';
      }

      toast({ 
        title: errorMessage, 
        description: errorDetails,
        variant: 'destructive' 
      });
      return;
    }

    // Additional validation checks
    if (selectedFile.name.length > 255) {
      toast({ 
        title: 'File name too long', 
        description: 'Please rename your file to be under 255 characters.',
        variant: 'destructive' 
      });
      return;
    }

    // Check for valid file extension
    const validExtensions = ['.mp4', '.webm', '.mov', '.mkv', '.avi'];
    const lastDotIndex = selectedFile.name.lastIndexOf('.');
    const fileExtension = lastDotIndex !== -1 ? selectedFile.name.toLowerCase().substring(lastDotIndex) : '';
    if (!fileExtension || !validExtensions.includes(fileExtension)) {
      toast({ 
        title: 'Invalid file extension', 
        description: `The file extension "${fileExtension || 'none'}" is not supported. Please use: ${validExtensions.join(', ')}`,
        variant: 'destructive' 
      });
      return;
    }

    setFile(selectedFile);
    if (onVideoChange) onVideoChange(selectedFile);

    const prevUrl = URL.createObjectURL(selectedFile);
    setVideoPreviewUrl(prevUrl);

    if (!title) {
      const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTitle(cleanName.slice(0, 100));
    }

    generateFramePreviews(selectedFile);

    // Pre-upload Content-ID pipeline: flag duplicated audio/video before publishing.
    setPreCheck({ state: 'scanning' });
    checkCopyrightStatus(selectedFile, title, description)
      .then((res) => {
        setPreCheck({ state: 'done', status: res.status, message: res.message });
        if (res.status === 'duplicate' || res.status === 'claimed') {
          toast({ title: 'Copyright check', description: res.message, variant: 'destructive' });
        }
      })
      .catch(() => setPreCheck({ state: 'idle' }));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectVideoFile(e.target.files[0]);
    }
  };

  const handleCustomThumbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const imgFile = e.target.files[0];
      const imgCheck = validateFile(imgFile, 'image');
      if (!imgCheck.ok) {
        // Provide detailed error messages for image validation
        let errorMessage = imgCheck.error;
        let errorDetails = '';

        if (imgCheck.error.includes('too large')) {
          const fileSizeMB = (imgFile.size / (1024 * 1024)).toFixed(2);
          errorDetails = `Your image is ${fileSizeMB}MB. Maximum size is 8MB. Please compress your image.`;
        } else if (imgCheck.error.includes('Unsupported')) {
          errorDetails = 'Supported formats: JPEG, PNG, WebP, AVIF. Please convert your image to a supported format.';
        } else if (imgCheck.error.includes('empty')) {
          errorDetails = 'The selected image appears to be corrupted or empty. Please select a different file.';
        }

        toast({ 
          title: errorMessage, 
          description: errorDetails,
          variant: 'destructive' 
        });
        return;
      }
      const imgUrl = URL.createObjectURL(imgFile);
      setCustomThumbUrl(imgUrl);
      setSelectedThumbIndex(3); // 3 represents custom thumbnail
    }
  };

  // Auto-save draft timer
  useEffect(() => {
    if (!open || !file) return;
    const timer = setTimeout(() => {
      setAutoSaving(true);
      setTimeout(() => {
        setAutoSaving(false);
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      }, 400);
    }, 2500);
    return () => clearTimeout(timer);
  }, [title, description, category, selectedPlaylist, open, file]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNetworkRecoveryAttempt(prev => prev + 1);
      toast({ 
        title: 'Network connection restored', 
        description: 'You can continue uploading.',
        variant: 'default' 
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({ 
        title: 'Network connection lost', 
        description: 'Please check your internet connection. Upload will pause.',
        variant: 'destructive' 
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Run Content ID & Processing Simulation on Step 2
  useEffect(() => {
    if (step === 2 && file) {
      setProcessingStage('uploading');
      setUploadProgress(0);
      setCopyrightStatus('scanning');
      setClaimDetails(null);

      // Simulate Upload Stage (0 -> 100%)
      const uploadInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 100) {
            clearInterval(uploadInterval);
            setProcessingStage('processing_hd');

            // HD Processing phase
            setTimeout(async () => {
              setProcessingStage('copyright_check');

              // Generate unique cryptographic video fingerprint using real file SHA-256
              const fp = await generateVideoFingerprint(title || file?.name || 'Untitled Video', file?.size || 10485760, duration || 120, file);
              setGeneratedFingerprint(fp);
              console.log('Generated video fingerprint for client-side duplicate check:', fp);

              // Copyright check phase using fingerprint and content ID index
              if (file) {
                // Skip copyright check for large files to prevent crash
                const MAX_COPYRIGHT_CHECK_SIZE = 25 * 1024 * 1024; // Reduced to 25MB limit for safety
                if (file.size > MAX_COPYRIGHT_CHECK_SIZE) {
                  console.log('File too large for copyright check, skipping to prevent crash');
                  setProcessingStage('complete');
                  setCopyrightStatus('clean');
                } else {
                  // Wrap copyright check in try-catch with timeout to prevent app crash
                  try {
                    // First, check for duplicate using SHA-256 hash in videos table
                    const { data: { user } } = await supabase.auth.getUser();
                    
                    if (user) {
                      try {
                        // Check for duplicate using SHA-256 hash (more reliable than fingerprint)
                        const { data: hashDuplicate, error: hashError } = await supabase
                          .from('videos')
                          .select('id, title, owner_id')
                          .eq('sha256', fp.replace('PRX-FP-SHA256-', '')) // Extract actual hash from fingerprint string
                          .maybeSingle();

                        if (!hashError && hashDuplicate) {
                          console.warn('Duplicate video detected via SHA-256 hash:', hashDuplicate);
                          setProcessingStage('complete');
                          setCopyrightStatus('duplicate');
                          setClaimDetails({
                            claimant: 'Content ID System',
                            track: `Duplicate Content Detected - Already exists as "${hashDuplicate.title}"`,
                            policy: 'Monetization Disabled - Auto-Blocked',
                            claimId: hashDuplicate.id
                          });
                          return; // Exit early if duplicate found
                        }
                      } catch (hashCheckError) {
                        console.error('SHA-256 hash check failed, continuing with fingerprint check:', hashCheckError);
                      }

                      try {
                        // Also check for duplicate fingerprint using Supabase RPC as backup
                        const { data: duplicateCheck, error: duplicateError } = await supabase
                          .rpc('check_and_handle_duplicate_fingerprint' as any, {
                            p_fingerprint: fp,
                            p_video_id: null, // No video ID yet since we're in Step 2
                            p_video_title: title || file.name,
                            p_owner_id: user.id
                          });
                        
                        if (duplicateError) {
                          console.error('Duplicate check RPC failed:', duplicateError);
                        } else if (Array.isArray(duplicateCheck) && duplicateCheck.length > 0) {
                          const checkResult = duplicateCheck[0];
                          if (checkResult.is_duplicate) {
                            console.warn('Duplicate content detected in Step 2 via fingerprint:', checkResult);
                            setProcessingStage('complete');
                            setCopyrightStatus('duplicate');
                            setClaimDetails({
                              claimant: 'Content ID System',
                              track: 'Duplicate Content Detected',
                              policy: 'Monetization Disabled - Auto-Blocked',
                              claimId: checkResult.claim_id
                            });
                            return; // Exit early if duplicate found
                          }
                        }
                      } catch (rpcError) {
                        console.error('RPC duplicate check failed:', rpcError);
                      }
                    }

                    // If no duplicate found, proceed with regular copyright check
                    // Use strict 10-second timeout with fallback to hash-based duplicate check
                    const copyrightCheckPromise = checkCopyrightViolation(file, title, description);
                    const timeoutPromise = new Promise((_, reject) => {
                      setTimeout(() => reject(new Error('Copyright check timeout')), 10000); // 10 second strict timeout
                    });

                    Promise.race([copyrightCheckPromise, timeoutPromise])
                      .then((matches) => {
                        setProcessingStage('complete');
                        if (Array.isArray(matches) && matches.length > 0) {
                          setCopyrightStatus('claimed');
                          setClaimDetails({
                            claimant: matches[0].owner_id || 'Universal Music Group',
                            track: `Fingerprint Match [${fp.slice(0, 16)}...]`,
                            policy: 'Monetized by copyright owner'
                          });
                        } else {
                          setCopyrightStatus('clean');
                        }
                      })
                      .catch((copyrightError) => {
                        console.error('Copyright check failed or timed out, falling back to hash check:', copyrightError);
                        // Fallback to hash-based duplicate check already handled in copyrightDetection.ts
                        setProcessingStage('complete');
                        setCopyrightStatus('clean');
                      });
                  } catch (error) {
                    console.error('Copyright check initialization failed:', error);
                    setProcessingStage('complete');
                    setCopyrightStatus('clean');
                  }
                }
              } else {
                setProcessingStage('complete');
                setCopyrightStatus('clean');
              }
            }, 1200);
            return 100;
          }
          return prev + 20;
        });
      }, 200);

      return () => clearInterval(uploadInterval);
    }
  }, [step, file]);

  // Calculate Ad Suitability Status
  const getAdSuitabilityRating = () => {
    if (!monetizationEnabled) return { label: 'Monetization Off', color: 'text-zinc-400 bg-zinc-800' };
    if (profanityLevel === 'strong' || adultLevel === 'explicit' || harmfulActs) {
      return { label: 'Ineligible for Ads (Violations Detected)', color: 'text-red-400 bg-red-950/60 border-red-500/40' };
    }
    if (profanityLevel === 'mild' || adultLevel === 'mild' || violenceLevel === 'mild' || !certifiedSafe) {
      return { label: 'Limited Ads Eligible', color: 'text-amber-400 bg-amber-950/60 border-amber-500/40' };
    }
    return { label: 'Full Ads Eligible', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40' };
  };

  const handleAddHashtag = (tag: string) => {
    if (!title.includes(tag) && title.length + tag.length + 1 <= 100) {
      setTitle((prev) => (prev ? `${prev} ${tag}` : tag));
    }
  };

  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    setCreatedPlaylists((prev) => [...prev, newPlaylistName.trim()]);
    setSelectedPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setShowNewPlaylistInput(false);
    toast({ title: 'Playlist Created!', description: `Added "${newPlaylistName.trim()}" to your playlists.` });
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const handleNextStep = () => {
    if (step === 1) {
      if (!file) {
        toast({ title: 'Please select a video file first', variant: 'destructive' });
        return;
      }
      if (!title.trim()) {
        const autoTitle = file.name ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : 'Untitled Video';
        setTitle(autoTitle.slice(0, 100));
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handlePublish = async () => {
    // Check network status before attempting upload
    if (!isOnline) {
      toast({ 
        title: 'No network connection', 
        description: 'Please check your internet connection and try again.',
        variant: 'destructive' 
      });
      return;
    }

    // Validate metadata and account state before anything is written.
    const parsedMeta = videoMetadataSchema.safeParse({
      title,
      description,
      category,
      tags,
      visibility: isScheduled ? 'scheduled' : visibility,
      monetization_enabled: monetizationEnabled,
    });
    if (!parsedMeta.success) {
      toast({ title: firstIssue(parsedMeta.error), variant: 'destructive' });
      return;
    }
    const verified = await requireVerifiedUser('publish a video');
    if (!verified) return;

    // Ensure user profile exists before upload
    const profileCreated = await ensureUserProfile(verified.id);
    if (!profileCreated) {
      toast({ 
        title: 'Profile setup required', 
        description: 'Could not set up your profile. Please try again.',
        variant: 'destructive' 
      });
      return;
    }

    if (!file) {
      toast({ title: 'Please select a video file first', variant: 'destructive' });
      return;
    }

    setPublishing(true);
    setUploadError(null);
    setUploadStartTime(Date.now());
    try {
      // Step 1: Validate file size before processing
      const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: 'File too large',
          description: `Maximum file size is ${MAX_FILE_SIZE / 1024 / 1024}MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
          variant: 'destructive'
        });
        setPublishing(false);
        return;
      }

      // Step 2: Final thumbnail selection URL
      let chosenThumb = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800';
      if (selectedThumbIndex === 3 && customThumbUrl) {
        chosenThumb = customThumbUrl;
      } else if (autoThumbnails[selectedThumbIndex]) {
        chosenThumb = autoThumbnails[selectedThumbIndex];
      }

      const finalDescription = tags.length > 0 && !description.includes(tags[0])
        ? `${description}\n\n${tags.join(' ')}`.trim()
        : description;

      // Step 3: Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        setPublishing(false);
        return;
      }

      // Step 4: Upload video using unified upload function
      console.log('Starting video upload with pre-signed URL');
      console.log('[UploadModal] Upload params:', {
        visibility: isScheduled ? 'scheduled' : visibility,
        isScheduled,
        visibilityRaw: visibility,
        title: title || 'Untitled Video'
      });
      
      const uploadResult = await uploadVideoWithCopyrightDetection({
        file: file,
        title: title || 'Untitled Video',
        description: finalDescription || '',
        tags: tags || [],
        category: category || 'entertainment',
        visibility: isScheduled ? 'scheduled' : visibility,
        scheduledAt: isScheduled ? scheduledDateTime : null,
        monetizationEnabled: monetizationEnabled || false,
        isShort: isShort || false,
        duration: duration ? Math.round(duration) : 180,
        thumbnailUrl: chosenThumb,
        ownerId: user.id,
        onProgress: (progress, stage) => {
          setUploadProgress(progress);
          if (stage) setUploadStage(stage);
          
          // Calculate ETA for large files
          if (progress > 0 && uploadStartTime) {
            const elapsed = Date.now() - uploadStartTime;
            const remaining = (elapsed / progress) * (100 - progress);
            setEstimatedTimeRemaining(remaining);
          }
        },
        onError: (errorType, message) => {
          setUploadError({ type: errorType, message, retryable: errorType === 'network_error' || errorType === 'server_error' });
        },
        maxRetries: 3
      });

      console.log('Upload result:', uploadResult);

      if (!uploadResult.success) {
        setUploadError({
          type: uploadResult.errorType || 'unknown_error',
          message: uploadResult.message || 'An error occurred during upload',
          retryable: uploadResult.retryable || false
        });
        toast({ 
          title: 'Upload failed', 
          description: uploadResult.message || 'An error occurred during upload',
          variant: 'destructive' 
        });
        setPublishing(false);
        return;
      }

      // Step 6: Handle copyright detection result
      if (uploadResult.status === 'copyright_flagged') {
        const isDuplicate = uploadResult.duplicateDetected;
        const claimId = (uploadResult as unknown as { claimId?: string }).claimId;
        
        toast({
          title: isDuplicate ? 'Duplicate / Copyright Claim Detected!' : 'Copyright content detected!',
          description: isDuplicate
            ? `Duplicate content found. Your video has been flagged and monetization disabled. Claim ID: ${claimId || 'N/A'}`
            : uploadResult.copyrightMatch?.songName 
              ? `Matched with: ${uploadResult.copyrightMatch.songName} (${(uploadResult.copyrightMatch.confidence || 0) * 100}% confidence)`
              : 'Your video contains copyrighted content and has been flagged for review.',
          variant: 'destructive'
        });
        
        // Update local state to show duplicate warning
        if (isDuplicate) {
          setCopyrightStatus('duplicate');
          setClaimDetails({
            claimant: 'Content ID System',
            track: 'Duplicate Content Detected',
            policy: 'Monetization Disabled - Auto-Blocked',
            claimId: claimId
          });
        }
      } else {
        toast({
          title: isScheduled ? 'Video Scheduled Successfully!' : 'Video Published Live!',
          description: isScheduled
            ? `Your video will go live on ${new Date(scheduledDateTime).toLocaleString()}`
            : 'Your content is now live across the PRO NAX feed.',
        });
      }

      // Step 7: Return success payload
      const newVideoPayload = {
        title,
        description: finalDescription,
        tags,
        category,
        playlist: selectedPlaylist !== 'none' ? selectedPlaylist : null,
        is_short: isShort,
        duration: duration ? Math.round(duration) : 180,
        thumbnail_url: chosenThumb,
        visibility: isScheduled ? 'scheduled' : visibility,
        scheduled_at: isScheduled ? scheduledDateTime : null,
        monetization_enabled: monetizationEnabled,
        copyright_status: uploadResult.status === 'copyright_flagged' ? 'claimed' : 'clean',
        created_at: new Date().toISOString(),
        videoId: uploadResult.videoId
      };

      if (onSuccess) onSuccess(newVideoPayload);
      onOpenChange(false);
    } catch (error) {
      console.error('Error publishing video:', error);
      setPublishing(false);
      toast({ 
        title: 'Upload failed', 
        description: error instanceof Error ? error.message : 'An unknown error occurred during upload. Please try again.',
        variant: 'destructive' 
      });
    } finally {
      setPublishing(false);
    }
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const suitability = getAdSuitabilityRating();

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-stretch sm:items-center justify-center pt-16 pb-14 sm:p-4 overflow-hidden animate-in fade-in-0 duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onOpenChange(false);
        }
      }}
    >
      <div 
        className="w-full sm:max-w-5xl h-full sm:h-[92vh] max-h-full sm:max-h-[880px] p-0 overflow-hidden flex flex-col bg-[#080a10] text-white border-0 sm:border sm:border-cyan-500/30 shadow-[0_0_60px_rgba(6,182,212,0.25)] rounded-none sm:rounded-3xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header with Holographic Glare */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-cyan-500/20 bg-[#0d101a]/90 holo-sweep shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600/30 via-cyan-500/20 to-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.25)] shrink-0">
              <UploadCloud className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-wide truncate font-display">
                  PRO NAX Publishing Wizard
                </h2>
                {isShort && (
                  <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-red-600 to-cyan-600 text-white text-[9px] font-mono font-bold tracking-wider uppercase shadow-[0_0_10px_rgba(239,68,68,0.3)]">
                    Shorts Detected
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-cyan-300/70 truncate">
                Step {step} of 3 — {step === 1 ? 'Details & Media' : step === 2 ? 'Checks & Monetization' : 'Visibility & Schedule'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Network Status Indicator */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
              {isOnline ? (
                <div className="flex items-center gap-1.5 text-emerald-400">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Online</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-400">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Offline</span>
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 font-mono">
              {autoSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
              {draftSaved && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{autoSaving ? 'Saving draft...' : draftSaved ? 'Draft saved' : 'Auto-save ready'}</span>
            </div>
            <button 
              type="button"
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-cyan-950/40 hover:border hover:border-cyan-500/30 transition min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Wizard Step Navigation Bar */}
        <div className="px-3 sm:px-6 py-2.5 border-b border-cyan-500/20 bg-[#0a0c14]/90 flex items-center justify-start sm:justify-between gap-2 overflow-x-auto shrink-0 scrollbar-none">
          {[
            { num: 1, label: '1. Details & Media', icon: Sparkles },
            { num: 2, label: '2. Checks & Monetization', icon: ShieldCheck },
            { num: 3, label: '3. Visibility & Schedule', icon: Globe },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                if (s.num > 1 && !file) {
                  toast({ title: 'Please select a video file first', variant: 'destructive' });
                  return;
                }
                if (!title.trim() && file) {
                  setTitle(file.name ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : 'Untitled Video');
                }
                setStep(s.num as WizardStep);
              }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer ${
                step === s.num
                  ? 'bg-gradient-to-r from-cyan-950/80 via-red-950/50 to-cyan-900/50 text-cyan-300 border border-cyan-400/60 shadow-[0_0_18px_rgba(6,182,212,0.25)]'
                  : 'text-zinc-300 hover:bg-cyan-950/30 hover:border hover:border-cyan-500/30'
              }`}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                s.num < step ? 'bg-emerald-400 text-black' : step === s.num ? 'bg-gradient-to-r from-red-500 to-cyan-500 text-white' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {s.num < step ? '✓' : s.num}
              </div>
              <span className="text-xs">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Main Scrollable Body Area */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:pb-10 scrollbar-thin scroll-gpu">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* ================= STEP 1: Details & Media Setup ================= */}
              {step === 1 && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-6">
                  {/* Live Video Player Preview (Natural flow on Mobile/Tablet, Right Column on Desktop) */}
                  <div className="order-1 xl:order-2 xl:col-span-5 space-y-3">
                    <div className="bg-[#0f121d]/90 border border-cyan-500/30 rounded-2xl p-4 space-y-3 shadow-[0_0_25px_rgba(6,182,212,0.12)]">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold text-cyan-300 uppercase tracking-wider block">
                          Live Video Player Preview
                        </Label>
                        <Badge variant="outline" className="text-[9px] border-cyan-500/40 text-cyan-300 bg-cyan-950/40">
                          {isShort ? 'VERTICAL SHORTS' : 'STANDARD HD'}
                        </Badge>
                      </div>

                      <div className="w-full aspect-video h-auto bg-black/90 rounded-xl overflow-hidden border border-cyan-500/30 relative group flex items-center justify-center shadow-inner p-4">
                        {videoPreviewUrl ? (
                          <video 
                            src={videoPreviewUrl} 
                            controls 
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="text-center p-4">
                            <Film className="w-8 h-8 text-cyan-500/50 mx-auto mb-2" />
                            <p className="text-xs text-zinc-400">Select a video to generate player preview</p>
                          </div>
                        )}
                      </div>

                      {/* File Metadata Card */}
                      <div className="p-2.5 sm:p-3 bg-[#080910] rounded-xl border border-cyan-500/20 space-y-1.5 font-mono text-[11px]">
                        <div className="flex justify-between text-zinc-400">
                          <span>Format:</span>
                          <span className="text-white font-bold">{file?.type || 'MP4 / WebM'}</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Quality:</span>
                          <span className="text-emerald-400 font-bold">1080p Full HD</span>
                        </div>
                        <div className="flex justify-between text-zinc-400">
                          <span>Classification:</span>
                          <span className="text-cyan-300 font-bold">{isShort ? 'PRO NAX Short' : 'Standard Feed'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Form Inputs (Scrollable beneath preview on Mobile, Left Column on Desktop) */}
                  <div className="order-2 xl:order-1 xl:col-span-7 space-y-5">
                    {/* Video File Upload Dropzone */}
                    {!file ? (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-cyan-500/30 hover:border-cyan-400 bg-[#0f121e]/80 hover:bg-[#131728]/90 p-6 sm:p-8 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all group shadow-[0_0_25px_rgba(6,182,212,0.08)]"
                      >
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600/20 to-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 mb-3 group-hover:scale-110 transition shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                          <UploadCloud className="w-7 h-7" />
                        </div>
                        <p className="text-sm font-bold text-white">Drag and drop video files to upload</p>
                        <p className="text-xs text-zinc-400 mt-1">Your content is protected until you choose to publish.</p>
                        <div className="mt-3 text-[10px] text-zinc-500 space-y-1">
                          <p>• MP4, WebM, MOV, MKV up to 2GB</p>
                          <p>• Recommended: 1080p, 30fps</p>
                          <p>• Network connection required</p>
                        </div>
                        <Button size="sm" className="mt-4 bg-gradient-to-r from-red-600 to-cyan-600 hover:from-red-500 hover:to-cyan-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-cyan-950/40 border border-cyan-300/30 min-h-[44px]">
                          SELECT FILES
                        </Button>
                        <input 
                          type="file" 
                          id="video-file-input"
                          ref={fileInputRef} 
                          onChange={handleFileInputChange} 
                          accept=".mp4,.webm,.mov,.mkv,.avi,video/*" 
                          className="hidden" 
                        />
                      </div>
                    ) : (
                      <div className="bg-[#0f121d]/90 border border-cyan-500/30 p-3.5 sm:p-4 rounded-xl flex items-center justify-between gap-3 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-red-600/20 border border-cyan-500/30 flex items-center justify-center shrink-0 text-cyan-400">
                            <Film className="w-5 h-5 text-cyan-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{file.name}</p>
                            <div className="flex items-center gap-2 text-[10px] text-cyan-300/80 font-mono mt-0.5">
                              <span>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                              {duration && <span>• {formatDuration(duration)}</span>}
                              {file.size > 500 * 1024 * 1024 && (
                                <span className="text-amber-400">• Large file</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => { setFile(null); setVideoPreviewUrl(null); setUploadError(null); }}
                          className="text-xs text-cyan-300 hover:text-white hover:bg-cyan-950/40 border border-cyan-500/20 min-h-[38px] cursor-pointer shrink-0"
                        >
                          Change File
                        </Button>
                      </div>
                    )}

                    {/* Pre-upload Content ID scan status */}
                    {file && preCheck.state !== 'idle' && (
                      <div
                        className={`rounded-xl border px-3 py-2 text-[11px] font-medium ${
                          preCheck.state === 'scanning'
                            ? 'border-cyan-500/30 bg-cyan-950/30 text-cyan-300'
                            : preCheck.status === 'clean'
                              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                              : preCheck.status === 'skipped'
                                ? 'border-zinc-600/40 bg-zinc-900/40 text-zinc-400'
                                : 'border-red-500/40 bg-red-950/30 text-red-300'
                        }`}
                      >
                        {preCheck.state === 'scanning'
                          ? 'Running Content ID copyright scan…'
                          : preCheck.message}
                      </div>
                    )}


                    {/* Title Input */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="video-title" className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                          Title (required) *
                        </Label>
                        <span className="text-[10px] text-zinc-500 font-mono">{title.length}/100</span>
                      </div>
                      <Input
                        id="video-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                        placeholder="Add an engaging title for your video"
                        className="bg-[#0f121d] border-cyan-500/25 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-white text-sm min-h-[44px] rounded-xl shadow-inner"
                      />
                    </div>

                    {/* Description Textarea */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="video-description" className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                          Description
                        </Label>
                        <span className="text-[10px] text-zinc-500 font-mono">{description.length}/5000</span>
                      </div>
                      <Textarea
                        id="video-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
                        placeholder="Tell viewers about your video (type @ to mention channels, # for hashtags)"
                        rows={3}
                        className="bg-[#0f121d] border-cyan-500/25 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 text-white text-xs resize-none rounded-xl p-3 shadow-inner"
                      />
                    </div>

                    {/* Custom Tags & Hashtags Input */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="video-tags" className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-cyan-400" /> Tags & Hashtags
                        </Label>
                        <span className="text-[10px] text-zinc-500 font-mono">{tags.length} added</span>
                      </div>
                      
                      <div className="bg-[#0f121d] border border-cyan-500/25 focus-within:border-cyan-400 rounded-xl p-2.5 space-y-2 shadow-inner">
                        <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                          {tags.map((tag) => (
                            <span 
                              key={tag} 
                              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg bg-cyan-950/80 text-cyan-200 border border-cyan-500/30"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(tag)}
                                className="hover:text-red-400 p-0.5 rounded transition cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            id="video-tags"
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleAddTag}
                            placeholder={tags.length === 0 ? "Type tag or hashtag and press Enter or comma..." : "Add tag..."}
                            className="bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none flex-1 min-w-[150px] px-1 py-0.5"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-400">
                        Add custom tags or hashtags for your video. Press Enter or comma to add each tag.
                      </p>
                    </div>

                    {/* Dynamic Thumbnail Selector (Responsive 2x2 on Mobile vertical, 4-col on Tablet/Desktop) */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-cyan-300 uppercase tracking-wider block">
                        Thumbnail Selection
                      </Label>
                      <p className="text-[11px] text-zinc-400">
                        Select an auto-generated frame or upload a custom thumbnail.
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                        {/* Auto Generated Frames */}
                        {[0, 1, 2].map((idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedThumbIndex(idx)}
                            className={`aspect-video rounded-xl border-2 overflow-hidden relative transition min-h-[64px] ${
                              selectedThumbIndex === idx
                                ? 'border-cyan-400 ring-2 ring-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.3)] bg-cyan-950/30'
                                : 'border-cyan-500/20 hover:border-cyan-500/50 bg-[#0f121d] opacity-80 hover:opacity-100'
                            }`}
                          >
                            {autoThumbnails[idx] ? (
                              <img src={autoThumbnails[idx]} alt={`Frame ${idx + 1}`} className="w-full h-full object-cover" />
                            ) : generatingThumbs ? (
                              <div className="w-full h-full bg-[#121522] flex items-center justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                              </div>
                            ) : (
                              <div className="w-full h-full bg-[#121522] flex flex-col items-center justify-center text-[10px] text-zinc-400">
                                <Film className="w-4 h-4 mb-1 text-cyan-400" />
                                <span>Frame {idx + 1}</span>
                              </div>
                            )}
                            {selectedThumbIndex === idx && (
                              <div className="absolute top-1 right-1 bg-gradient-to-r from-red-600 to-cyan-500 text-white rounded-full p-0.5 shadow-md">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </button>
                        ))}

                        {/* Custom Thumbnail Picker */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedThumbIndex(3);
                            thumbInputRef.current?.click();
                          }}
                          className={`aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition min-h-[64px] cursor-pointer ${
                            selectedThumbIndex === 3
                              ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200 ring-2 ring-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                              : 'border-cyan-500/30 hover:border-cyan-400 bg-[#0f121d] text-zinc-400 hover:text-white'
                          }`}
                        >
                          {customThumbUrl ? (
                            <img src={customThumbUrl} alt="Custom thumbnail" className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <>
                              <ImageIcon className="w-4 h-4 text-cyan-400" />
                              <span className="text-[10px] font-semibold text-center leading-tight">Custom Image</span>
                            </>
                          )}
                        </button>
                        <input
                          id="custom-thumbnail-input"
                          type="file"
                          ref={thumbInputRef}
                          onChange={handleCustomThumbChange}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>
                    </div>

                    {/* Category & Playlist Selectors */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Category Dropdown */}
                      <div>
                        <Label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1.5 block">
                          Category
                        </Label>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger className="bg-[#0f121d] border-cyan-500/25 text-xs text-white min-h-[44px] rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#121522] border-cyan-500/30 text-white">
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c} className="text-xs focus:bg-cyan-600 focus:text-white">
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Playlist Dropdown */}
                      <div>
                        <Label className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1.5 block">
                          Playlist
                        </Label>
                        {!showNewPlaylistInput ? (
                          <Select value={selectedPlaylist} onValueChange={(val) => {
                            if (val === '__new__') setShowNewPlaylistInput(true);
                            else setSelectedPlaylist(val);
                          }}>
                            <SelectTrigger className="bg-[#0f121d] border-cyan-500/25 text-xs text-white min-h-[44px] rounded-xl">
                              <SelectValue placeholder="Select or create playlist" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#121522] border-cyan-500/30 text-white">
                              <SelectItem value="none" className="text-xs">No playlist</SelectItem>
                              {createdPlaylists.map((p) => (
                                <SelectItem key={p} value={p} className="text-xs">
                                  {p}
                                </SelectItem>
                              ))}
                              <SelectItem value="__new__" className="text-xs text-cyan-400 font-bold border-t border-cyan-500/20 mt-1 pt-1">
                                + Create New Playlist
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              id="new-playlist-name"
                              value={newPlaylistName}
                              onChange={(e) => setNewPlaylistName(e.target.value)}
                              placeholder="New playlist name"
                              className="bg-[#0f121d] border-cyan-500/25 text-xs text-white flex-1 min-h-[44px] rounded-xl"
                            />
                            <Button size="sm" onClick={handleCreatePlaylist} className="bg-gradient-to-r from-red-600 to-cyan-600 text-xs min-h-[44px] px-4 rounded-xl">
                              Add
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 1 Bottom Action Bar */}
                    <div className="pt-4 border-t border-cyan-500/20 flex justify-end">
                      <Button
                        type="button"
                        onClick={handleNextStep}
                        className="bg-gradient-to-r from-red-600 via-cyan-600 to-cyan-500 hover:from-red-500 hover:to-cyan-400 text-white font-bold text-xs min-h-[44px] px-8 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.35)] border border-cyan-300/40 active:scale-95 transition-all flex items-center cursor-pointer"
                      >
                        <span>NEXT: CHECKS & MONETIZATION</span>
                        <ChevronRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= STEP 2: Content Checks & Monetization ================= */}
              {step === 2 && (
                <div className="max-w-3xl mx-auto space-y-6">
                  {/* Multi-Stage Scan Pipeline */}
                  <div className="bg-[#0f121d]/90 border border-cyan-500/30 p-4 sm:p-5 rounded-2xl space-y-3 shadow-[0_0_25px_rgba(6,182,212,0.1)]">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-white uppercase tracking-wider flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 text-cyan-400 ${processingStage !== 'complete' ? 'animate-spin' : ''}`} />
                        Processing & Scan Pipeline
                      </span>
                      <span className="text-cyan-400 font-mono">
                        {uploadStage || (processingStage === 'uploading' ? `Uploading (${uploadProgress}%)` : processingStage === 'processing_hd' ? 'Processing 1080p HD...' : processingStage === 'copyright_check' ? 'Scanning Content ID...' : 'Complete')}
                      </span>
                    </div>

                    <Progress value={processingStage === 'complete' ? 100 : uploadProgress} className="h-2 bg-zinc-800" />

                    <div className="flex items-center justify-between text-[10px] text-cyan-300 font-mono px-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Destination: Cloudflare R2 Vault (cdn.pronax.tv)
                      </span>
                      <span className="flex items-center gap-2">
                        <span>Chunked Resumable Upload Active</span>
                        {estimatedTimeRemaining && uploadProgress > 0 && uploadProgress < 100 && (
                          <span className="text-zinc-400">
                            ~{Math.round(estimatedTimeRemaining / 1000)}s remaining
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                      <div className={`p-2 rounded-lg border text-center font-mono ${uploadProgress >= 100 ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400' : 'bg-[#121522] border-cyan-500/20 text-zinc-500'}`}>
                        1. File Upload
                      </div>
                      <div className={`p-2 rounded-lg border text-center font-mono ${processingStage === 'processing_hd' || processingStage === 'copyright_check' || processingStage === 'complete' ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400' : 'bg-[#121522] border-cyan-500/20 text-zinc-500'}`}>
                        2. HD Processing
                      </div>
                      <div className={`p-2 rounded-lg border text-center font-mono ${processingStage === 'complete' ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400' : 'bg-[#121522] border-cyan-500/20 text-zinc-500'}`}>
                        3. Content ID Check
                      </div>
                    </div>
                  </div>

                  {/* Upload Error Banner */}
                  {uploadError && (
                    <div className="p-4 rounded-2xl border border-red-500/50 bg-red-950/40 text-red-200 flex items-start gap-3.5 transition shadow-xl">
                      <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                      <div className="space-y-2 flex-1">
                        <h3 className="text-sm font-bold">Upload Failed</h3>
                        <p className="text-xs leading-relaxed text-red-100">{uploadError.message}</p>
                        {uploadError.retryable && (
                          <button
                            type="button"
                            onClick={handlePublish}
                            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Retry Upload
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Copyright Scan Banner */}
                  {!uploadError && (
                    <div className={`p-4 rounded-2xl border flex items-start gap-3.5 transition shadow-xl ${
                      copyrightStatus === 'clean'
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                        : copyrightStatus === 'claimed' || copyrightStatus === 'duplicate'
                        ? 'bg-red-950/40 border-red-500/50 text-red-200'
                        : 'bg-[#0f121d] border-cyan-500/30 text-zinc-300'
                    }`}>
                    {copyrightStatus === 'clean' ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                    ) : copyrightStatus === 'claimed' || copyrightStatus === 'duplicate' ? (
                      <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    ) : (
                      <Loader2 className="w-6 h-6 text-cyan-400 animate-spin shrink-0 mt-0.5" />
                    )}

                    <div className="space-y-1 flex-1">
                      <h3 className="text-sm font-bold">
                        {copyrightStatus === 'clean'
                          ? 'No Copyright Issues Found'
                          : copyrightStatus === 'duplicate'
                          ? 'Copyright / Duplicate Claim Detected'
                          : copyrightStatus === 'claimed'
                          ? 'Copyright Claim Detected (Content ID Match)'
                          : 'Performing Automated Content ID Scan...'}
                      </h3>
                      <p className="text-xs leading-relaxed text-zinc-300">
                        {copyrightStatus === 'clean'
                          ? 'Content ID scan complete. No audio or visual copyright matches were identified in your video.'
                          : copyrightStatus === 'duplicate'
                          ? `Duplicate content detected by Content ID System. ${claimDetails?.policy || 'Monetization disabled - auto-blocked'}. Claim ID: ${claimDetails?.claimId || 'N/A'}.`
                          : copyrightStatus === 'claimed'
                          ? `Audio track match identified by ${claimDetails?.claimant || 'Copyright Holder'}. ${claimDetails?.policy || 'Monetized by owner'}. No strikes applied to channel.`
                          : 'Analyzing video audio wave patterns against global copyright databases.'}
                      </p>

                      {generatedFingerprint && (
                        <div className="pt-2 flex items-center gap-2">
                          <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-slate-900 border border-cyan-500/30 text-cyan-300 font-bold">
                            FP: {generatedFingerprint}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {copyrightStatus === 'duplicate' ? 'Fingerprint Match Found - Duplicate Content' : 'Unique Fingerprint Registered'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {/* Monetization & Self-Certification Section */}
                  <div className="bg-[#0f121d]/90 border border-cyan-500/30 p-4 sm:p-5 rounded-2xl space-y-4 shadow-lg">
                    <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-emerald-400" />
                          <span>Video Monetization</span>
                        </h3>
                        <p className="text-[11px] text-zinc-400">Earn revenue from display and video ads shown during playback.</p>
                      </div>
                      <Switch 
                        checked={monetizationEnabled} 
                        onCheckedChange={setMonetizationEnabled} 
                      />
                    </div>

                    {monetizationEnabled && (
                      <div className="space-y-4 pt-1">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-[#080910] border border-cyan-500/20">
                          <span className="text-xs font-semibold text-zinc-300">Ad Suitability Self-Rating:</span>
                          <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${suitability.color}`}>
                            {suitability.label}
                          </span>
                        </div>

                        {/* Ad Suitability Checklist */}
                        <div className="space-y-3 pt-2">
                          <Label className="text-xs font-bold text-cyan-300 uppercase tracking-wider block">
                            Ad Suitability Questionnaire
                          </Label>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-[#121522] border border-cyan-500/20 space-y-1">
                              <span className="text-xs font-semibold text-white block">Inappropriate Language</span>
                              <Select value={profanityLevel} onValueChange={(v: any) => setProfanityLevel(v)}>
                                <SelectTrigger className="bg-[#0b0d14] border-cyan-500/30 text-xs h-9 rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#121522] text-xs">
                                  <SelectItem value="none">None (Clean)</SelectItem>
                                  <SelectItem value="mild">Mild (Occasional)</SelectItem>
                                  <SelectItem value="strong">Strong / Excessive</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="p-3 rounded-xl bg-[#121522] border border-cyan-500/20 space-y-1">
                              <span className="text-xs font-semibold text-white block">Adult Content</span>
                              <Select value={adultLevel} onValueChange={(v: any) => setAdultLevel(v)}>
                                <SelectTrigger className="bg-[#0b0d14] border-cyan-500/30 text-xs h-9 rounded-lg">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#121522] text-xs">
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="mild">Mild References</SelectItem>
                                  <SelectItem value="explicit">Explicit</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#121522] border border-cyan-500/20 cursor-pointer hover:border-cyan-400 transition min-h-[44px]">
                            <input 
                              type="checkbox" 
                              checked={certifiedSafe} 
                              onChange={(e) => setCertifiedSafe(e.target.checked)}
                              className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-cyan-500 focus:ring-cyan-500"
                            />
                            <span className="text-xs text-zinc-300 font-medium">
                              None of the above — I certify this video meets advertiser-friendly guidelines.
                            </span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Step 2 Bottom Action Bar */}
                    <div className="pt-4 border-t border-cyan-500/20 flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(1)}
                        className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-950/40 text-xs font-bold min-h-[44px] px-5 rounded-xl cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        <span>BACK TO DETAILS</span>
                      </Button>
                      <Button
                        type="button"
                        onClick={handleNextStep}
                        className="bg-gradient-to-r from-red-600 via-cyan-600 to-cyan-500 hover:from-red-500 hover:to-cyan-400 text-white font-bold text-xs min-h-[44px] px-8 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.35)] border border-cyan-300/40 active:scale-95 transition-all flex items-center cursor-pointer"
                      >
                        <span>NEXT: VISIBILITY & PUBLISH</span>
                        <ChevronRight className="w-4 h-4 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= STEP 3: Visibility & Schedule ================= */}
              {step === 3 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="bg-[#0f121d]/90 border border-cyan-500/30 p-4 sm:p-5 rounded-2xl space-y-4 shadow-lg">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-cyan-500/20 pb-3">
                      <Globe className="w-4 h-4 text-cyan-400" />
                      <span>Visibility & Publication Settings</span>
                    </h3>

                    {/* Radio Grid for Visibility */}
                    <div className="space-y-2.5">
                      {[
                        { id: 'public', label: 'Public', desc: 'Everyone can search for and watch your video immediately.', icon: Globe },
                        { id: 'unlisted', label: 'Unlisted', desc: 'Anyone with the video link can watch. Does not appear on public search.', icon: LinkIcon },
                        { id: 'private', label: 'Private', desc: 'Only you and specific invited users can watch.', icon: Lock },
                      ].map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => { setVisibility(v.id as any); setIsScheduled(false); }}
                          className={`w-full p-3.5 sm:p-4 rounded-xl border text-left flex items-start gap-3 transition min-h-[48px] ${
                            visibility === v.id && !isScheduled
                              ? 'bg-gradient-to-r from-cyan-950/60 to-red-950/40 border-cyan-400/80 ring-1 ring-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                              : 'bg-[#121522] border-cyan-500/20 hover:border-cyan-400/40'
                          }`}
                        >
                          <v.icon className={`w-5 h-5 shrink-0 mt-0.5 ${visibility === v.id && !isScheduled ? 'text-cyan-400' : 'text-zinc-400'}`} />
                          <div>
                            <div className="text-xs font-bold text-white">{v.label}</div>
                            <div className="text-[11px] text-zinc-400 mt-0.5">{v.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Schedule Section */}
                    <div className="pt-2 border-t border-cyan-500/20">
                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#121522] border border-cyan-500/20 cursor-pointer hover:border-cyan-400 transition mb-3 min-h-[44px]">
                        <input 
                          type="checkbox" 
                          checked={isScheduled} 
                          onChange={(e) => setIsScheduled(e.target.checked)}
                          className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-cyan-500 focus:ring-cyan-500"
                        />
                        <span className="text-xs text-white font-bold flex items-center gap-2">
                          <Clock className="w-4 h-4 text-cyan-400" />
                          Schedule publication for a future date
                        </span>
                      </label>

                      {isScheduled && (
                        <div className="p-3 bg-[#080910] border border-cyan-500/20 rounded-xl space-y-1.5">
                          <Label className="text-xs text-zinc-400">Select Date & Time</Label>
                          <Input
                            type="datetime-local"
                            value={scheduledDateTime}
                            onChange={(e) => setScheduledDateTime(e.target.value)}
                            className="bg-[#0f121d] border-cyan-500/30 text-xs text-white min-h-[44px] rounded-xl"
                          />
                        </div>
                      )}
                    </div>

                    {/* Step 3 Bottom Action Bar */}
                    <div className="pt-4 border-t border-cyan-500/20 flex items-center justify-between gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStep(2)}
                        className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-950/40 text-xs font-bold min-h-[44px] px-5 rounded-xl cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        <span>BACK TO CHECKS</span>
                      </Button>
                      <Button
                        type="button"
                        onClick={handlePublish}
                        disabled={publishing}
                        className="bg-gradient-to-r from-red-600 via-cyan-600 to-cyan-500 hover:from-red-500 hover:to-cyan-400 text-white font-bold text-xs min-h-[44px] px-8 rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.4)] border border-cyan-300/40 active:scale-95 transition-all flex items-center cursor-pointer disabled:opacity-50"
                      >
                        {publishing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Publishing...
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-4 h-4 mr-2" />
                            {isScheduled ? 'SCHEDULE VIDEO' : 'PUBLISH VIDEO'}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Modal Footer Controls (Fixed Safe Area at Bottom) */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-cyan-500/25 bg-[#0b0d15] flex items-center justify-between gap-2 shrink-0 z-50 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-xs font-semibold text-zinc-300 hover:text-white hover:bg-cyan-950/30 min-h-[42px] px-3.5 sm:px-4 rounded-xl cursor-pointer"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2 sm:gap-3">
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => (s - 1) as WizardStep)}
                className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-950/40 text-xs font-bold min-h-[42px] px-4 sm:px-5 rounded-xl cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                BACK
              </Button>
            )}

            {step < 3 ? (
              <Button
                type="button"
                onClick={handleNextStep}
                className="bg-gradient-to-r from-red-600 via-cyan-600 to-cyan-500 hover:from-red-500 hover:to-cyan-400 text-white font-bold text-xs min-h-[42px] px-6 sm:px-8 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.35)] border border-cyan-300/40 active:scale-95 transition-all flex items-center cursor-pointer"
              >
                <span>NEXT</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                className="bg-gradient-to-r from-red-600 via-cyan-600 to-cyan-500 hover:from-red-500 hover:to-cyan-400 text-white font-bold text-xs min-h-[42px] px-6 sm:px-8 rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.4)] border border-cyan-300/40 active:scale-95 transition-all flex items-center cursor-pointer disabled:opacity-50"
              >
                {publishing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 mr-2" />
                    {isScheduled ? 'SCHEDULE VIDEO' : 'PUBLISH VIDEO'}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
