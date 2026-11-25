import pefile, os, re, collections, sys, json

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=False)

print("=== PE ===")
print("machine", hex(pe.FILE_HEADER.Machine), "chars", hex(pe.FILE_HEADER.Characteristics))
print("timestamp", pe.FILE_HEADER.TimeDateStamp, "subsystem", pe.OPTIONAL_HEADER.Subsystem)
print("imagebase", hex(pe.OPTIONAL_HEADER.ImageBase), "entry", hex(pe.OPTIONAL_HEADER.AddressOfEntryPoint))
print("sections:")
for s in pe.sections:
    print("  %-10s VA=%08X VS=%08X raw=%08X ptr=%08X ch=%08X" % (
        s.Name.rstrip(b"\0").decode("latin1"), s.VirtualAddress, s.Misc_VirtualSize,
        s.SizeOfRawData, s.PointerToRawData, s.Characteristics))
print("imports:")
for d in pe.DIRECTORY_ENTRY_IMPORT:
    names = [i.name.decode() for i in d.imports if i.name]
    print("  %-16s %d" % (d.dll.decode(), len(d.imports)))
    print("     ", ", ".join(names[:25]), "..." if len(names) > 25 else "")
print("exports:", len(getattr(pe, "DIRECTORY_ENTRY_EXPORT", []).symbols) if hasattr(pe, "DIRECTORY_ENTRY_EXPORT") else 0)
for attr in ["DIRECTORY_ENTRY_RESOURCE"]:
    print(attr, hasattr(pe, attr))
if hasattr(pe, "DIRECTORY_ENTRY_RESOURCE"):
    for t in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        print("  res type", t.id, t.name)
