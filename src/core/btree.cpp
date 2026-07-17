#include "yggdrasil/core/btree.hpp"

#include <algorithm>
#include <functional>
#include <unordered_set>
#include <utility>

namespace yggdrasil {

namespace {

template <typename NodeType>
[[nodiscard]] auto keyPosition(NodeType& node, const int operativeId) {
    return std::lower_bound(
        node.keys.begin(),
        node.keys.end(),
        operativeId,
        [](const Operative& operative, const int id) { return operative.id < id; });
}

[[nodiscard]] std::vector<int> operativeIds(const std::vector<Operative>& operatives) {
    std::vector<int> ids;
    ids.reserve(operatives.size());
    for (const Operative& operative : operatives) {
        ids.push_back(operative.id);
    }
    return ids;
}

} // namespace

struct BTree::Node {
    explicit Node(const NodeId nodeId, Node* const parentNode)
        : id(nodeId), parent(parentNode) {}

    const NodeId id;
    Node* parent{nullptr};
    std::vector<Operative> keys;
    std::vector<std::unique_ptr<Node>> children;

    [[nodiscard]] bool leaf() const noexcept { return children.empty(); }
};

struct BTree::SplitResult {
    bool split{false};
    Operative promoted;
    std::unique_ptr<Node> right;
};

const NodeSnapshot* TreeSnapshot::findNode(const NodeId id) const noexcept {
    const auto found = std::find_if(
        nodes.begin(), nodes.end(), [id](const NodeSnapshot& node) { return node.id == id; });
    return found == nodes.end() ? nullptr : &*found;
}

BTree::BTree() = default;

BTree::BTree(BTreeEventSink sink) : eventSink_(std::move(sink)) {}

BTree::~BTree() = default;

std::unique_ptr<BTree::Node> BTree::makeNode(Node* const parent) {
    auto node = std::make_unique<Node>(nextNodeId_++, parent);
    emit(BTreeEvent{
        .type = BTreeEventType::NodeCreated,
        .nodeId = node->id,
        .parentNodeId = parent == nullptr ? 0 : parent->id,
        .keys = {},
    });
    return node;
}

bool BTree::insert(Operative operative) {
    const int insertedId = operative.id;
    if (const Node* const duplicateNode = findNodeForKey(insertedId); duplicateNode != nullptr) {
        emit(BTreeEvent{
            .type = BTreeEventType::DuplicateRejected,
            .key = insertedId,
            .nodeId = duplicateNode->id,
            .keys = operativeIds(duplicateNode->keys),
        });
        return false;
    }

    if (root_ == nullptr) {
        root_ = makeNode(nullptr);
        root_->keys.push_back(std::move(operative));
    } else {
        SplitResult split = insertRecursive(*root_, std::move(operative));
        if (split.split) {
            auto newRoot = makeNode(nullptr);
            newRoot->keys.push_back(std::move(split.promoted));
            root_->parent = newRoot.get();
            split.right->parent = newRoot.get();
            newRoot->children.push_back(std::move(root_));
            newRoot->children.push_back(std::move(split.right));
            root_ = std::move(newRoot);
        }
    }

    ++size_;
    const Node* const insertedNode = findNodeForKey(insertedId);
    emit(BTreeEvent{
        .type = BTreeEventType::OperativeInserted,
        .key = insertedId,
        .nodeId = insertedNode == nullptr ? 0 : insertedNode->id,
        .parentNodeId = insertedNode == nullptr || insertedNode->parent == nullptr
                            ? 0
                            : insertedNode->parent->id,
        .keys = insertedNode == nullptr ? std::vector<int>{} : operativeIds(insertedNode->keys),
    });
    return true;
}

BTree::SplitResult BTree::insertRecursive(Node& node, Operative operative) {
    const int operativeId = operative.id;
    auto position = keyPosition(node, operativeId);
    const std::size_t index = static_cast<std::size_t>(position - node.keys.begin());

    if (node.leaf()) {
        node.keys.insert(position, std::move(operative));
    } else {
        SplitResult childSplit = insertRecursive(*node.children[index], std::move(operative));
        if (childSplit.split) {
            node.keys.insert(node.keys.begin() + static_cast<std::ptrdiff_t>(index),
                             std::move(childSplit.promoted));
            childSplit.right->parent = &node;
            node.children.insert(
                node.children.begin() + static_cast<std::ptrdiff_t>(index + 1),
                std::move(childSplit.right));
        }
    }

    return node.keys.size() == overflowKeys ? splitOverflow(node) : SplitResult{};
}

BTree::SplitResult BTree::splitOverflow(Node& node) {
    // Canonical Yggdrasil rule: [0,1,2,3] promotes [2], retaining [0,1]
    // in the stable left node and placing [3] in a newly identified right node.
    SplitResult result;
    result.split = true;
    result.promoted = std::move(node.keys[2]);
    result.right = makeNode(node.parent);
    result.right->keys.push_back(std::move(node.keys[3]));
    node.keys.resize(2);

    if (!node.children.empty()) {
        result.right->children.reserve(2);
        for (std::size_t index = 3; index < node.children.size(); ++index) {
            node.children[index]->parent = result.right.get();
            result.right->children.push_back(std::move(node.children[index]));
        }
        node.children.resize(3);
    }

    std::vector<int> resultingKeys = operativeIds(node.keys);
    const std::vector<int> rightKeys = operativeIds(result.right->keys);
    resultingKeys.insert(resultingKeys.end(), rightKeys.begin(), rightKeys.end());
    emit(BTreeEvent{
        .type = BTreeEventType::NodeSplit,
        .promotedKey = result.promoted.id,
        .nodeId = node.id,
        .otherNodeId = result.right->id,
        .parentNodeId = node.parent == nullptr ? 0 : node.parent->id,
        .keys = std::move(resultingKeys),
    });
    return result;
}

bool BTree::erase(const int operativeId) {
    const Node* const existingNode = findNodeForKey(operativeId);
    if (existingNode == nullptr) {
        emit(BTreeEvent{
            .type = BTreeEventType::EraseMissing,
            .key = operativeId,
            .keys = {},
        });
        return false;
    }
    const NodeId originalNodeId = existingNode->id;

    const bool erased = eraseRecursive(*root_, operativeId);
    if (!erased) {
        return false; // Defensive: the pre-search and recursive search must agree.
    }
    --size_;

    if (root_->keys.empty()) {
        const NodeId oldRootId = root_->id;
        if (!root_->children.empty()) {
            std::unique_ptr<Node> newRoot = std::move(root_->children.front());
            newRoot->parent = nullptr;
            root_ = std::move(newRoot);
            emit(BTreeEvent{
                .type = BTreeEventType::RootReduced,
                .key = operativeId,
                .nodeId = oldRootId,
                .otherNodeId = root_->id,
                .keys = operativeIds(root_->keys),
            });
        } else {
            root_.reset();
            emit(BTreeEvent{
                .type = BTreeEventType::RootReduced,
                .key = operativeId,
                .nodeId = oldRootId,
                .keys = {},
            });
        }
    }

    emit(BTreeEvent{
        .type = BTreeEventType::OperativeErased,
        .key = operativeId,
        .nodeId = originalNodeId,
        .keys = {},
    });
    return true;
}

bool BTree::eraseRecursive(Node& node, const int operativeId) {
    auto position = keyPosition(node, operativeId);
    const std::size_t index = static_cast<std::size_t>(position - node.keys.begin());

    if (position != node.keys.end() && position->id == operativeId) {
        if (node.leaf()) {
            node.keys.erase(position);
            return true;
        }

        Node* predecessorNode = node.children[index].get();
        while (!predecessorNode->leaf()) {
            predecessorNode = predecessorNode->children.back().get();
        }
        const int predecessorId = predecessorNode->keys.back().id;
        node.keys[index] = predecessorNode->keys.back();
        const bool removed = eraseRecursive(*node.children[index], predecessorId);
        if (removed && node.children[index]->keys.empty()) {
            rebalanceChild(node, index);
        }
        return removed;
    }

    if (node.leaf()) {
        return false;
    }

    const bool removed = eraseRecursive(*node.children[index], operativeId);
    if (removed && node.children[index]->keys.empty()) {
        rebalanceChild(node, index);
    }
    return removed;
}

void BTree::rebalanceChild(Node& parent, const std::size_t childIndex) {
    if (childIndex + 1 < parent.children.size() &&
        parent.children[childIndex + 1]->keys.size() > minimumKeys) {
        borrowFromRight(parent, childIndex);
        return;
    }
    if (childIndex > 0 && parent.children[childIndex - 1]->keys.size() > minimumKeys) {
        borrowFromLeft(parent, childIndex);
        return;
    }
    mergeChild(parent, childIndex);
}

void BTree::borrowFromRight(Node& parent, const std::size_t childIndex) {
    Node& receiver = *parent.children[childIndex];
    Node& donor = *parent.children[childIndex + 1];
    const int descendedKey = parent.keys[childIndex].id;
    const int promotedKey = donor.keys.front().id;

    receiver.keys.push_back(std::move(parent.keys[childIndex]));
    parent.keys[childIndex] = std::move(donor.keys.front());
    donor.keys.erase(donor.keys.begin());

    if (!donor.children.empty()) {
        std::unique_ptr<Node> transferred = std::move(donor.children.front());
        donor.children.erase(donor.children.begin());
        transferred->parent = &receiver;
        receiver.children.push_back(std::move(transferred));
    }

    emit(BTreeEvent{
        .type = BTreeEventType::BorrowedFromRight,
        .key = descendedKey,
        .promotedKey = promotedKey,
        .nodeId = receiver.id,
        .otherNodeId = donor.id,
        .parentNodeId = parent.id,
        .keys = operativeIds(receiver.keys),
    });
}

void BTree::borrowFromLeft(Node& parent, const std::size_t childIndex) {
    Node& receiver = *parent.children[childIndex];
    Node& donor = *parent.children[childIndex - 1];
    const int descendedKey = parent.keys[childIndex - 1].id;
    const int promotedKey = donor.keys.back().id;

    receiver.keys.insert(receiver.keys.begin(), std::move(parent.keys[childIndex - 1]));
    parent.keys[childIndex - 1] = std::move(donor.keys.back());
    donor.keys.pop_back();

    if (!donor.children.empty()) {
        std::unique_ptr<Node> transferred = std::move(donor.children.back());
        donor.children.pop_back();
        transferred->parent = &receiver;
        receiver.children.insert(receiver.children.begin(), std::move(transferred));
    }

    emit(BTreeEvent{
        .type = BTreeEventType::BorrowedFromLeft,
        .key = descendedKey,
        .promotedKey = promotedKey,
        .nodeId = receiver.id,
        .otherNodeId = donor.id,
        .parentNodeId = parent.id,
        .keys = operativeIds(receiver.keys),
    });
}

void BTree::mergeChild(Node& parent, const std::size_t childIndex) {
    std::size_t leftIndex = childIndex;
    if (leftIndex + 1 >= parent.children.size()) {
        --leftIndex;
    }

    Node& survivor = *parent.children[leftIndex];
    Node& removed = *parent.children[leftIndex + 1];
    const NodeId removedId = removed.id;
    const int separatorId = parent.keys[leftIndex].id;

    survivor.keys.push_back(std::move(parent.keys[leftIndex]));
    for (Operative& operative : removed.keys) {
        survivor.keys.push_back(std::move(operative));
    }
    for (std::unique_ptr<Node>& child : removed.children) {
        child->parent = &survivor;
        survivor.children.push_back(std::move(child));
    }

    parent.keys.erase(parent.keys.begin() + static_cast<std::ptrdiff_t>(leftIndex));
    parent.children.erase(parent.children.begin() + static_cast<std::ptrdiff_t>(leftIndex + 1));

    emit(BTreeEvent{
        .type = BTreeEventType::NodesMerged,
        .key = separatorId,
        .nodeId = survivor.id,
        .otherNodeId = removedId,
        .parentNodeId = parent.id,
        .keys = operativeIds(survivor.keys),
    });
}

void BTree::clear() {
    if (root_ == nullptr) {
        // A new match must reproduce the same node IDs from the same insertion
        // sequence; stable IDs are scoped to one tree lifetime.
        nextNodeId_ = 1;
        return;
    }
    const NodeId oldRootId = root_->id;
    root_.reset();
    size_ = 0;
    emit(BTreeEvent{
        .type = BTreeEventType::TreeCleared,
        .nodeId = oldRootId,
        .keys = {},
    });
    nextNodeId_ = 1;
}

Operative* BTree::find(const int operativeId) noexcept {
    Node* const node = findNodeForKey(operativeId);
    if (node == nullptr) {
        return nullptr;
    }
    const auto position = keyPosition(*node, operativeId);
    return position == node->keys.end() ? nullptr : &*position;
}

const Operative* BTree::find(const int operativeId) const noexcept {
    const Node* const node = findNodeForKey(operativeId);
    if (node == nullptr) {
        return nullptr;
    }
    const auto position = keyPosition(*node, operativeId);
    return position == node->keys.end() ? nullptr : &*position;
}

bool BTree::contains(const int operativeId) const noexcept {
    return findNodeForKey(operativeId) != nullptr;
}

BTree::Node* BTree::findNodeForKey(const int operativeId) noexcept {
    Node* current = root_.get();
    while (current != nullptr) {
        const auto position = keyPosition(*current, operativeId);
        if (position != current->keys.end() && position->id == operativeId) {
            return current;
        }
        if (current->leaf()) {
            return nullptr;
        }
        const std::size_t index = static_cast<std::size_t>(position - current->keys.begin());
        current = current->children[index].get();
    }
    return nullptr;
}

const BTree::Node* BTree::findNodeForKey(const int operativeId) const noexcept {
    const Node* current = root_.get();
    while (current != nullptr) {
        const auto position = keyPosition(*current, operativeId);
        if (position != current->keys.end() && position->id == operativeId) {
            return current;
        }
        if (current->leaf()) {
            return nullptr;
        }
        const std::size_t index = static_cast<std::size_t>(position - current->keys.begin());
        current = current->children[index].get();
    }
    return nullptr;
}

std::optional<NodeId> BTree::nodeIdFor(const int operativeId) const noexcept {
    const Node* const found = findNodeForKey(operativeId);
    return found == nullptr ? std::nullopt : std::optional<NodeId>{found->id};
}

BTree::Node* BTree::findNodeById(const NodeId nodeId) noexcept {
    return const_cast<Node*>(std::as_const(*this).findNodeById(nodeId));
}

const BTree::Node* BTree::findNodeById(const NodeId nodeId) const noexcept {
    if (nodeId == 0 || root_ == nullptr) {
        return nullptr;
    }
    std::function<const Node*(const Node&)> visit = [&](const Node& node) -> const Node* {
        if (node.id == nodeId) {
            return &node;
        }
        for (const std::unique_ptr<Node>& child : node.children) {
            if (const Node* const found = visit(*child); found != nullptr) {
                return found;
            }
        }
        return nullptr;
    };
    return visit(*root_);
}

NodeSnapshot BTree::makeSnapshot(const Node& node) const {
    NodeSnapshot result;
    result.id = node.id;
    if (node.parent != nullptr) {
        result.parentId = node.parent->id;
    }
    result.keys = operativeIds(node.keys);
    result.operatives = node.keys;
    result.children.reserve(node.children.size());
    for (const std::unique_ptr<Node>& child : node.children) {
        result.children.push_back(child->id);
    }
    result.leaf = node.leaf();
    return result;
}

std::unique_ptr<BTree::Node> BTree::cloneNode(const Node& source, Node* const parent) const {
    auto copy = std::make_unique<Node>(source.id, parent);
    copy->keys = source.keys;
    copy->children.reserve(source.children.size());
    for (const std::unique_ptr<Node>& child : source.children) {
        copy->children.push_back(cloneNode(*child, copy.get()));
    }
    return copy;
}

std::optional<NodeSnapshot> BTree::node(const NodeId nodeId) const {
    const Node* const found = findNodeById(nodeId);
    return found == nullptr ? std::nullopt : std::optional<NodeSnapshot>{makeSnapshot(*found)};
}

std::optional<NodeSnapshot> BTree::nodeForKey(const int operativeId) const {
    const Node* const found = findNodeForKey(operativeId);
    return found == nullptr ? std::nullopt : std::optional<NodeSnapshot>{makeSnapshot(*found)};
}

std::optional<Operative> BTree::predecessor(const int operativeId) const {
    const Node* current = root_.get();
    const Operative* candidate = nullptr;

    while (current != nullptr) {
        const auto position = keyPosition(*current, operativeId);
        const std::size_t index = static_cast<std::size_t>(position - current->keys.begin());
        if (index > 0) {
            candidate = &current->keys[index - 1];
        }

        if (position != current->keys.end() && position->id == operativeId) {
            if (!current->leaf()) {
                current = current->children[index].get();
                while (!current->leaf()) {
                    current = current->children.back().get();
                }
                candidate = &current->keys.back();
            }
            break;
        }

        if (current->leaf()) {
            break;
        }
        current = current->children[index].get();
    }

    return candidate == nullptr ? std::nullopt : std::optional<Operative>{*candidate};
}

InsertPrediction BTree::predictInsert(const int operativeId) const {
    InsertPrediction prediction;
    prediction.projectedHeight = height();

    if (root_ == nullptr) {
        prediction.projectedHeight = 1;
        return prediction;
    }

    const Node* current = root_.get();
    while (true) {
        prediction.path.push_back(current->id);
        const auto position = keyPosition(*current, operativeId);
        const std::size_t index = static_cast<std::size_t>(position - current->keys.begin());
        if (position != current->keys.end() && position->id == operativeId) {
            prediction.duplicate = true;
            prediction.destinationNodeId = current->id;
            return prediction;
        }
        if (current->leaf()) {
            prediction.destinationNodeId = current->id;
            break;
        }
        current = current->children[index].get();
    }

    while (current != nullptr && current->keys.size() == maxKeys) {
        prediction.splitNodeIds.push_back(current->id);
        if (current->parent == nullptr) {
            prediction.rootSplit = true;
            ++prediction.projectedHeight;
            break;
        }
        current = current->parent;
    }
    return prediction;
}

RelocationPrediction BTree::predictRelocation(const int operativeId,
                                              const int destinationId) const {
    RelocationPrediction result;
    BTree simulated;
    if (root_ != nullptr) simulated.root_ = cloneNode(*root_, nullptr);
    simulated.size_ = size_;
    simulated.nextNodeId_ = nextNodeId_;
    simulated.nextEventSequence_ = nextEventSequence_;

    if (!simulated.erase(operativeId)) {
        result.sourceMissing = true;
        result.afterErase = simulated.snapshot();
        result.insertion.duplicate = true;
        return result;
    }
    result.afterErase = simulated.snapshot();
    result.insertion = simulated.predictInsert(destinationId);
    return result;
}

std::vector<Operative> BTree::inOrder() const {
    std::vector<Operative> result;
    result.reserve(size_);
    if (root_ == nullptr) {
        return result;
    }

    std::function<void(const Node&)> visit = [&](const Node& node) {
        for (std::size_t index = 0; index < node.keys.size(); ++index) {
            if (!node.leaf()) {
                visit(*node.children[index]);
            }
            result.push_back(node.keys[index]);
        }
        if (!node.leaf()) {
            visit(*node.children.back());
        }
    };
    visit(*root_);
    return result;
}

TreeSnapshot BTree::snapshot() const {
    TreeSnapshot result;
    result.size = size_;
    result.height = height();
    if (root_ == nullptr) {
        return result;
    }

    result.rootId = root_->id;
    std::function<void(const Node&)> visit = [&](const Node& node) {
        result.nodes.push_back(makeSnapshot(node));
        for (const std::unique_ptr<Node>& child : node.children) {
            visit(*child);
        }
    };
    visit(*root_);
    return result;
}

std::size_t BTree::height() const noexcept {
    std::size_t result = 0;
    const Node* current = root_.get();
    while (current != nullptr) {
        ++result;
        current = current->leaf() ? nullptr : current->children.front().get();
    }
    return result;
}

std::optional<NodeId> BTree::rootId() const noexcept {
    return root_ == nullptr ? std::nullopt : std::optional<NodeId>{root_->id};
}

BTreeValidation BTree::validate() const {
    BTreeValidation result;
    if (root_ == nullptr) {
        result.valid = size_ == 0;
        if (size_ != 0) {
            result.errors.emplace_back("empty root with non-zero recorded size");
        }
        return result;
    }

    std::unordered_set<NodeId> nodeIds;
    std::optional<std::size_t> leafDepth;

    const auto error = [&](std::string message) { result.errors.push_back(std::move(message)); };
    std::function<void(const Node&, const Node*, std::size_t, std::optional<int>, std::optional<int>)>
        visit;
    visit = [&](const Node& node,
                const Node* expectedParent,
                const std::size_t depth,
                const std::optional<int> lower,
                const std::optional<int> upper) {
        ++result.nodeCount;
        result.keyCount += node.keys.size();

        if (node.id == 0) {
            error("node ID zero is reserved");
        }
        if (!nodeIds.insert(node.id).second) {
            error("duplicate node ID " + std::to_string(node.id));
        }
        if (node.parent != expectedParent) {
            error("broken parent link at node " + std::to_string(node.id));
        }
        if (node.keys.size() > maxKeys) {
            error("node " + std::to_string(node.id) + " exceeds three keys");
        }
        if (&node != root_.get() && node.keys.size() < minimumKeys) {
            error("non-root node " + std::to_string(node.id) + " is in underflow");
        }
        if (&node == root_.get() && node.keys.empty()) {
            error("non-empty tree has a keyless root");
        }

        for (std::size_t index = 0; index < node.keys.size(); ++index) {
            const int key = node.keys[index].id;
            if (index > 0 && node.keys[index - 1].id >= key) {
                error("keys are not strictly ordered in node " + std::to_string(node.id));
            }
            if (lower.has_value() && key <= *lower) {
                error("key violates lower bound in node " + std::to_string(node.id));
            }
            if (upper.has_value() && key >= *upper) {
                error("key violates upper bound in node " + std::to_string(node.id));
            }
        }

        if (node.leaf()) {
            if (!leafDepth.has_value()) {
                leafDepth = depth;
            } else if (*leafDepth != depth) {
                error("leaves are not at one uniform depth");
            }
            return;
        }

        if (node.children.size() != node.keys.size() + 1) {
            error("internal node " + std::to_string(node.id) +
                  " does not have key-count plus one children");
        }
        const std::size_t traversable = std::min(node.children.size(), node.keys.size() + 1);
        for (std::size_t index = 0; index < traversable; ++index) {
            if (node.children[index] == nullptr) {
                error("null child in internal node " + std::to_string(node.id));
                continue;
            }
            const std::optional<int> childLower =
                index == 0 ? lower : std::optional<int>{node.keys[index - 1].id};
            const std::optional<int> childUpper =
                index == node.keys.size() ? upper : std::optional<int>{node.keys[index].id};
            visit(*node.children[index], &node, depth + 1, childLower, childUpper);
        }
    };

    visit(*root_, nullptr, 0, std::nullopt, std::nullopt);
    result.height = leafDepth.has_value() ? *leafDepth + 1 : 0;
    if (result.keyCount != size_) {
        error("recorded size differs from reachable key count");
    }
    if (result.height != height()) {
        error("reported height differs from structural height");
    }
    result.valid = result.errors.empty();
    return result;
}

void BTree::setEventSink(BTreeEventSink sink) {
    eventSink_ = std::move(sink);
}

std::vector<BTreeEvent> BTree::takeEvents() {
    std::vector<BTreeEvent> result = std::move(events_);
    events_.clear();
    return result;
}

void BTree::emit(BTreeEvent event) {
    event.sequence = nextEventSequence_++;
    events_.push_back(event);
    if (eventSink_) {
        // Rendering/logging callbacks must never be able to leave a structural
        // operation half-finished.
        try {
            eventSink_(event);
        } catch (...) {
        }
    }
}

} // namespace yggdrasil
