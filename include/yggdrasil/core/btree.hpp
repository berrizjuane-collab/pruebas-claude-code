#pragma once

#include "yggdrasil/core/types.hpp"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace yggdrasil {

using NodeId = std::uint64_t;

enum class BTreeEventType {
    NodeCreated,
    OperativeInserted,
    DuplicateRejected,
    NodeSplit,
    OperativeErased,
    EraseMissing,
    BorrowedFromRight,
    BorrowedFromLeft,
    NodesMerged,
    RootReduced,
    TreeCleared,
};

// A compact structural record that can be translated to GameEvent without
// coupling the data structure to the game loop. Node IDs never change during
// a node's lifetime. A zero ID means "not applicable".
struct BTreeEvent {
    std::uint64_t sequence{0};
    BTreeEventType type{BTreeEventType::NodeCreated};
    int key{0};
    int promotedKey{0};
    NodeId nodeId{0};
    NodeId otherNodeId{0};
    NodeId parentNodeId{0};
    std::vector<int> keys;
};

using BTreeEventSink = std::function<void(const BTreeEvent&)>;

struct NodeSnapshot {
    NodeId id{0};
    std::optional<NodeId> parentId;
    std::vector<int> keys;
    std::vector<Operative> operatives;
    std::vector<NodeId> children;
    bool leaf{true};
};

struct TreeSnapshot {
    std::optional<NodeId> rootId;
    std::vector<NodeSnapshot> nodes; // deterministic pre-order
    std::size_t size{0};
    std::size_t height{0};           // empty=0, one-node tree=1

    [[nodiscard]] const NodeSnapshot* findNode(NodeId id) const noexcept;
};

struct InsertPrediction {
    bool duplicate{false};
    std::vector<NodeId> path;
    std::optional<NodeId> destinationNodeId;
    std::vector<NodeId> splitNodeIds; // leaf-to-root order
    bool rootSplit{false};
    std::size_t projectedHeight{0};
};

struct RelocationPrediction {
    bool sourceMissing{false};
    TreeSnapshot afterErase;
    InsertPrediction insertion;
};

struct BTreeValidation {
    bool valid{true};
    std::size_t nodeCount{0};
    std::size_t keyCount{0};
    std::size_t height{0};
    std::vector<std::string> errors;

    [[nodiscard]] explicit operator bool() const noexcept { return valid; }
};

// An authentic order-4 B-tree (2-3-4 tree). Insertion is bottom-up: a
// temporary four-key overflow promotes index 2, leaving two keys on the left
// and one on the right, exactly like the canonical Yggdrasil implementation.
class BTree {
public:
    using NodeId = yggdrasil::NodeId;
    using NodeSnapshot = yggdrasil::NodeSnapshot;
    using TreeSnapshot = yggdrasil::TreeSnapshot;
    using InsertPrediction = yggdrasil::InsertPrediction;
    using RelocationPrediction = yggdrasil::RelocationPrediction;
    using Validation = yggdrasil::BTreeValidation;
    using Event = BTreeEvent;
    using EventType = BTreeEventType;
    using EventSink = BTreeEventSink;

    static constexpr std::size_t maxKeys = 3;
    static constexpr std::size_t overflowKeys = 4;
    static constexpr std::size_t minimumKeys = 1;

    BTree();
    explicit BTree(BTreeEventSink sink);
    ~BTree();

    BTree(const BTree&) = delete;
    BTree& operator=(const BTree&) = delete;
    BTree(BTree&&) = delete;
    BTree& operator=(BTree&&) = delete;

    [[nodiscard]] bool insert(Operative operative);
    [[nodiscard]] bool erase(int operativeId);
    void clear();

    [[nodiscard]] Operative* find(int operativeId) noexcept;
    [[nodiscard]] const Operative* find(int operativeId) const noexcept;
    [[nodiscard]] Operative* search(int operativeId) noexcept { return find(operativeId); }
    [[nodiscard]] const Operative* search(int operativeId) const noexcept {
        return find(operativeId);
    }
    [[nodiscard]] bool contains(int operativeId) const noexcept;

    [[nodiscard]] std::optional<NodeId> nodeIdFor(int operativeId) const noexcept;
    [[nodiscard]] std::optional<NodeSnapshot> node(NodeId nodeId) const;
    [[nodiscard]] std::optional<NodeSnapshot> nodeForKey(int operativeId) const;
    [[nodiscard]] std::optional<Operative> predecessor(int operativeId) const;
    [[nodiscard]] InsertPrediction predictInsert(int operativeId) const;
    [[nodiscard]] RelocationPrediction predictRelocation(int operativeId,
                                                         int destinationId) const;

    [[nodiscard]] std::vector<Operative> inOrder() const;
    [[nodiscard]] TreeSnapshot snapshot() const;
    [[nodiscard]] BTreeValidation validate() const;

    [[nodiscard]] std::size_t count() const noexcept { return size_; }
    [[nodiscard]] std::size_t size() const noexcept { return size_; }
    [[nodiscard]] bool empty() const noexcept { return size_ == 0; }
    [[nodiscard]] std::size_t height() const noexcept;
    [[nodiscard]] std::optional<NodeId> rootId() const noexcept;

    void setEventSink(BTreeEventSink sink);
    [[nodiscard]] const std::vector<BTreeEvent>& events() const noexcept { return events_; }
    [[nodiscard]] std::vector<BTreeEvent> takeEvents();
    void clearEvents() noexcept { events_.clear(); }

private:
    struct Node;
    struct SplitResult;

    std::unique_ptr<Node> root_;
    std::size_t size_{0};
    NodeId nextNodeId_{1};
    std::uint64_t nextEventSequence_{1};
    BTreeEventSink eventSink_;
    std::vector<BTreeEvent> events_;

    [[nodiscard]] std::unique_ptr<Node> makeNode(Node* parent);
    [[nodiscard]] SplitResult insertRecursive(Node& node, Operative operative);
    [[nodiscard]] SplitResult splitOverflow(Node& node);

    [[nodiscard]] bool eraseRecursive(Node& node, int operativeId);
    void rebalanceChild(Node& parent, std::size_t childIndex);
    void borrowFromRight(Node& parent, std::size_t childIndex);
    void borrowFromLeft(Node& parent, std::size_t childIndex);
    void mergeChild(Node& parent, std::size_t childIndex);

    [[nodiscard]] Node* findNodeForKey(int operativeId) noexcept;
    [[nodiscard]] const Node* findNodeForKey(int operativeId) const noexcept;
    [[nodiscard]] Node* findNodeById(NodeId nodeId) noexcept;
    [[nodiscard]] const Node* findNodeById(NodeId nodeId) const noexcept;
    [[nodiscard]] NodeSnapshot makeSnapshot(const Node& node) const;
    [[nodiscard]] std::unique_ptr<Node> cloneNode(const Node& source, Node* parent) const;

    void emit(BTreeEvent event);
};

} // namespace yggdrasil
