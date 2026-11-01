/** Standard-library / platform module names per ecosystem (things that ship with the language, not packages). */

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean))

export const NODE_BUILTINS = set(`
  assert async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns domain
  events fs http http2 https inspector module net os path perf_hooks process punycode querystring readline repl
  stream string_decoder sys timers tls trace_events tty url util v8 vm wasi worker_threads zlib test sqlite sea
`)

export const PYTHON_STDLIB = set(`
  __future__ __main__ _thread abc aifc argparse array ast asynchat asyncio asyncore atexit audioop base64 bdb binascii
  bisect builtins bz2 calendar cgi cgitb chunk cmath cmd code codecs codeop collections colorsys compileall concurrent
  configparser contextlib contextvars copy copyreg cProfile crypt csv ctypes curses dataclasses datetime dbm decimal
  difflib dis distutils doctest email encodings ensurepip enum errno faulthandler fcntl filecmp fileinput fnmatch
  fractions ftplib functools gc getopt getpass gettext glob graphlib grp gzip hashlib heapq hmac html http idlelib
  imaplib imghdr imp importlib inspect io ipaddress itertools json keyword lib2to3 linecache locale logging lzma
  mailbox mailcap marshal math mimetypes mmap modulefinder msilib msvcrt multiprocessing netrc nis nntplib ntpath
  numbers operator optparse os ossaudiodev pathlib pdb pickle pickletools pipes pkgutil platform plistlib poplib
  posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc queue quopri random re readline reprlib
  resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site smtpd smtplib sndhdr
  socket socketserver spwd sqlite3 sre_compile sre_constants sre_parse ssl stat statistics string stringprep struct
  subprocess sunau symtable sys sysconfig syslog tabnanny tarfile telnetlib tempfile termios textwrap threading time
  timeit tkinter token tokenize tomllib trace traceback tracemalloc tty turtle turtledemo types typing
  typing_extensions unicodedata unittest urllib uu uuid venv warnings wave weakref webbrowser winreg winsound wsgiref
  xdrlib xml xmlrpc zipapp zipfile zipimport zlib zoneinfo _collections_abc _io _weakref _typeshed
`)

export const RUBY_STDLIB = set(`
  abbrev base64 benchmark bigdecimal cgi coverage csv date delegate digest drb English erb etc expect fcntl fiber
  fiddle fileutils find forwardable getoptlong io/console io/wait ipaddr irb json logger matrix minitest monitor mutex_m
  net/http net/https net/ftp net/smtp net/imap net/pop nkf objspace observer open-uri open3 openssl optparse ostruct
  pathname pp prettyprint prime pstore psych pty racc rake rbconfig rdoc readline reline resolv ripper securerandom
  set shellwords singleton socket stringio strscan syslog tempfile test/unit thread time timeout tmpdir tracer tsort
  un uri weakref yaml zlib rubygems bundler bundler/setup
`)

export const C_STD_HEADERS = set(`
  assert.h complex.h ctype.h errno.h fenv.h float.h inttypes.h iso646.h limits.h locale.h math.h setjmp.h signal.h
  stdalign.h stdarg.h stdatomic.h stdbool.h stddef.h stdint.h stdio.h stdlib.h stdnoreturn.h string.h tgmath.h
  threads.h time.h uchar.h wchar.h wctype.h
  unistd.h fcntl.h pthread.h dirent.h dlfcn.h poll.h sched.h semaphore.h syslog.h termios.h strings.h libgen.h
  netdb.h getopt.h glob.h grp.h pwd.h regex.h spawn.h utime.h sys/types.h sys/stat.h sys/socket.h sys/time.h
  sys/wait.h sys/mman.h sys/ioctl.h sys/select.h sys/resource.h sys/un.h sys/uio.h sys/param.h sys/epoll.h
  sys/event.h sys/utsname.h sys/file.h sys/syscall.h netinet/in.h netinet/tcp.h arpa/inet.h windows.h winsock2.h
  ws2tcpip.h io.h conio.h process.h direct.h malloc.h alloca.h endian.h byteswap.h execinfo.h
  algorithm any array atomic barrier bit bitset cassert ccomplex cctype cerrno cfenv cfloat charconv chrono cinttypes
  ciso646 climits clocale cmath codecvt compare complex concepts condition_variable coroutine csetjmp csignal
  cstdarg cstddef cstdint cstdio cstdlib cstring ctime cuchar cwchar cwctype deque exception execution expected
  filesystem format forward_list fstream functional future initializer_list iomanip ios iosfwd iostream istream
  iterator latch limits list locale map memory memory_resource mutex new numbers numeric optional ostream print
  queue random ranges ratio regex scoped_allocator semaphore set shared_mutex source_location span sstream stack
  stdexcept stop_token streambuf string string_view syncstream system_error thread tuple type_traits typeindex
  typeinfo unordered_map unordered_set utility valarray variant vector version
  Foundation/Foundation.h UIKit/UIKit.h AppKit/AppKit.h Cocoa/Cocoa.h
`)

export const SWIFT_FRAMEWORKS = set(`
  Swift Foundation UIKit SwiftUI AppKit Cocoa Combine CoreData CoreGraphics CoreLocation MapKit AVFoundation AVKit
  XCTest Testing os OSLog Darwin Dispatch ObjectiveC WatchKit WidgetKit StoreKit CloudKit HealthKit ARKit SceneKit
  SpriteKit Metal MetalKit Photos PhotosUI UserNotifications Security LocalAuthentication CryptoKit Network WebKit
  SafariServices AuthenticationServices GameKit GameplayKit CoreML CreateML Vision VisionKit NaturalLanguage Speech
  CoreImage CoreMedia CoreMotion CoreBluetooth CoreText CoreAudio CoreHaptics CoreNFC CoreSpotlight QuartzCore
  Accelerate simd Observation SwiftData Charts RealityKit EventKit EventKitUI Contacts ContactsUI MessageUI PassKit
  AppIntents Intents IntentsUI BackgroundTasks Social AdSupport AppTrackingTransparency iAd ImageIO MobileCoreServices
  UniformTypeIdentifiers QuickLook PDFKit LinkPresentation SystemConfiguration CoreTelephony CarPlay ClockKit
  FileProvider PencilKit MultipeerConnectivity ExternalAccessory Glibc Foundation.NSString _Concurrency RegexBuilder
`)

export const ELIXIR_STDLIB = set(`
  Kernel Enum Enumerable List Map MapSet Keyword String Integer Float Atom Tuple Range Stream IO File Path System
  Process Task Agent GenServer Supervisor DynamicSupervisor Registry Application Logger Code Macro Module Protocol
  Regex URI Base Bitwise Calendar Date DateTime NaiveDateTime Time Access Exception Function Inspect Port Node
  Record Collectable ExUnit Mix EEx IEx Config PartitionSupervisor Version OptionParser StringIO JSON
`)

export const LUA_BUILTINS = set('string table math os io coroutine debug utf8 package bit32 bit jit ffi')

export const R_BASE = set(`
  base stats utils methods graphics grDevices datasets parallel grid splines tools tcltk compiler stats4
`)

export const PERL_CORE = set(`
  strict warnings utf8 lib constant vars parent base feature integer overload bytes locale open sort subs
  Exporter POSIX Carp Cwd Data::Dumper Encode English Env Errno Fcntl FindBin Getopt::Long Getopt::Std
  IO::File IO::Handle IO::Socket JSON::PP List::Util MIME::Base64 Scalar::Util Socket Storable Symbol
  Sys::Hostname Text::Wrap Tie::Hash Time::HiRes Time::Local Test::More Test::Simple Benchmark File::Basename
  File::Copy File::Find File::Path File::Spec File::Temp Digest::MD5 Digest::SHA Term::ANSIColor Pod::Usage
`)

export const JULIA_STDLIB = set(`
  Base Core Main LinearAlgebra Statistics Random Dates Printf Test Distributed SparseArrays Pkg InteractiveUtils
  Serialization SharedArrays Sockets Logging Markdown Mmap Profile REPL SHA Unicode UUIDs DelimitedFiles Libdl
  FileWatching Downloads Tar TOML Base64 CRC32c LibGit2 NetworkOptions ArgTools
`)

export const NIM_STD = set(`
  os strutils sequtils tables sets json times math strformat streams parseutils options sugar algorithm hashes
  macros typetraits terminal asyncdispatch asyncnet httpclient net uri unicode random re nre osproc parseopt
  logging unittest critbits deques heapqueue lists bitops endians md5 sha1 base64 encodings colors
`)

export const ELM_CORE_PREFIXES = ['Basics', 'List', 'Maybe', 'Result', 'String', 'Char', 'Tuple', 'Debug', 'Platform', 'Cmd', 'Sub', 'Array', 'Dict', 'Set', 'Task', 'Process', 'Html', 'Browser', 'Json', 'Http', 'Url', 'Time', 'Svg', 'File', 'Bytes', 'Random', 'Parser']

export const HASKELL_BASE_PREFIXES = [
  'Prelude',
  'Data.',
  'Control.',
  'System.',
  'Text.Printf',
  'Text.Read',
  'Text.Show',
  'GHC.',
  'Foreign',
  'Numeric',
  'Debug.Trace',
  'Unsafe.',
  'Type.',
]

/** Erlang/OTP and other "always there" tooling names for generic fallbacks. */
export const ZIG_BUILTINS = set('std builtin root')
