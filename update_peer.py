import os

file_path = 'src/hooks/use-peer-game.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Replace initPeer
old_init_peer = """    const initPeer = async () => {
      const peerOptions: ConstructorParameters<typeof Peer>[1] = {}"""
new_init_peer = """    const initPeer = async () => {
      const { default: Peer } = await import('peerjs')
      const peerOptions: ConstructorParameters<typeof Peer>[1] = {}"""

content = content.replace(old_init_peer, new_init_peer)

# Replace joinAsGuest
old_join_guest = """    const joinAsGuest = () => {
      const peerOptions: ConstructorParameters<typeof Peer>[1] = {}"""
new_join_guest = """    const joinAsGuest = async () => {
      const { default: Peer } = await import('peerjs')
      const peerOptions: ConstructorParameters<typeof Peer>[1] = {}"""

content = content.replace(old_join_guest, new_join_guest)

with open(file_path, 'w') as f:
    f.write(content)

print("File updated successfully")
