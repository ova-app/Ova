import os
os.chdir("/c/Users/SofianeBESSILA/orava")

with open('mobile_app/app/workout/session.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove old WheelPickerModal and WheelPicker
start = content.find('// ─── WheelPicker Modal')
end = content.find('// ─── SetRow (swipe delete)', start)

if start != -1 and end != -1:
    content = content[:start] + '// ─── SetRow (swipe delete)' + content[end + len('// ─── SetRow (swipe delete)'):]

with open('mobile_app/app/workout/session.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK - removed old components")
